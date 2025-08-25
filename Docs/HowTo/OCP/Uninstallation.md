# AWS
## Cluster Destruction
<details><summary>Manual</summary>

```shell
ocpClsName='...clusterName...'
ocpInfra='...clusterUniqueInfrastructureID...'
################################################################################
#    1. Clean Up Load Balancer Resources
##      List V2 Load Balancers's Listeners.
(
    arns="$(
        aws resourcegroupstaggingapi get-resources \
            --tag-filters "Key=kubernetes.io/cluster/${ocpInfra},Values=owned" \
            --resource-type-filters elasticloadbalancing:listener \
            --output text \
            --query 'ResourceTagMappingList[*].ResourceARN'
    )"
    [ "${arns}" ] && aws elbv2 describe-listeners \
        --listener-arns ${arns} \
        --output table \
        --query 'Listeners[*].{
            Port:Port,
            ForwardsTo:DefaultActions[0].TargetGroupArn,
            Protocol:Protocol
        }'
)
##      Delete V2 Load Balancers's Listeners.
(
    for e in $(
        aws resourcegroupstaggingapi get-resources \
            --tag-filters "Key=kubernetes.io/cluster/${ocpInfra},Values=owned" \
            --resource-type-filters elasticloadbalancing:listener \
            --output text \
            --query 'ResourceTagMappingList[*].ResourceARN'
    ); do
        echo "Deleting \`${e}\`..."
        aws elbv2 delete-listener --listener-arn "${e}" --no-cli-pager
    done
)
##      List V2 Load Balancers's Target Groups.
(
    arns="$(
        aws resourcegroupstaggingapi get-resources \
            --tag-filters "Key=kubernetes.io/cluster/${ocpInfra},Values=owned" \
            --resource-type-filters elasticloadbalancing:targetgroup \
            --output text \
            --query 'ResourceTagMappingList[*].ResourceARN'
    )"
    [ "${arns}" ] && aws elbv2 describe-target-groups \
        --target-group-arns ${arns} \
        --output table \
        --query 'TargetGroups[*].{
            Name:TargetGroupName, Port:Port, Protocol:Protocol, Type:TargetType
        }'
)
##      Delete V2 Load Balancers's Target Groups.
(
    for e in $(
        aws resourcegroupstaggingapi get-resources \
            --tag-filters "Key=kubernetes.io/cluster/${ocpInfra},Values=owned" \
            --resource-type-filters elasticloadbalancing:targetgroup \
            --output text \
            --query 'ResourceTagMappingList[*].ResourceARN'
    ); do
        echo "Deleting \`${e}\`..."
        aws elbv2 delete-target-group --target-group-arn "${e}" --no-cli-pager
    done
)
##      List V2 Load Balancers.
(
    arns="$(
        aws resourcegroupstaggingapi get-resources \
            --tag-filters "Key=kubernetes.io/cluster/${ocpInfra},Values=owned" \
            --resource-type-filters elasticloadbalancing:loadbalancer  \
            --output text \
            --query 'ResourceTagMappingList[*].ResourceARN' |
        tr '\t' '\n' | grep -E '/(app|net)/'
    )"
    [ "${arns}" ] && aws elbv2 describe-load-balancers \
        --load-balancer-arns ${arns} \
        --output table \
        --query 'LoadBalancers[*].{
            Name:LoadBalancerName, Scheme:Scheme, Type:Type
        }'
)
##      Delete V2 Load Balancers.
(
    for e in $(
        aws resourcegroupstaggingapi get-resources \
            --tag-filters "Key=kubernetes.io/cluster/${ocpInfra},Values=owned" \
            --resource-type-filters elasticloadbalancing:loadbalancer \
            --output text \
            --query 'ResourceTagMappingList[*].ResourceARN' |
        tr '\t' '\n' | grep -E '/(app|net)/'
    ); do
        echo "Deleting \`${e}\`..."
        aws elbv2 delete-load-balancer --load-balancer-arn "${e}" --no-cli-pager
    done
)
##      List V1 Load Balancers.
(
    arns="$(
        aws resourcegroupstaggingapi get-resources \
            --tag-filters "Key=kubernetes.io/cluster/${ocpInfra},Values=owned" \
            --resource-type-filters elasticloadbalancing:loadbalancer  \
            --output text \
            --query 'ResourceTagMappingList[*].ResourceARN' |
        tr '\t' '\n' | grep -vE '/(app|net)/' | cut -d / -f 2
    )"
    [ "${arns}" ] && aws elb describe-load-balancers \
        --load-balancer-names ${arns} \
        --output table \
        --query 'LoadBalancerDescriptions[*].{
            Name:LoadBalancerName,
            Scheme:Scheme,
            "EC2 Instances":Instances[].InstanceId
        }'
)
##      Delete V1 Load Balancers.
(
    for e in $(
        aws resourcegroupstaggingapi get-resources \
            --tag-filters "Key=kubernetes.io/cluster/${ocpInfra},Values=owned" \
            --resource-type-filters elasticloadbalancing:loadbalancer  \
            --output text \
            --query 'ResourceTagMappingList[*].ResourceARN' |
        tr '\t' '\n' | grep -vE '/(app|net)/' | cut -d / -f2
    ); do
        for e2 in $(
            aws elb describe-load-balancers \
                --load-balancer-names "${e}" \
                --output text \
                --query 'LoadBalancerDescriptions[*].Instances[*].InstanceId'
        ); do
            echo "Deregistering \`${e2}\` from V1 Load Balancer \`${e}\`..."
            aws elb deregister-instances-from-load-balancer \
                --load-balancer-name "${e}" \
                --instances "${e2}" \
                --no-cli-pager
        echo "Deleting V1 Load Balancer \`${e}\`..."
        aws elb delete-load-balancer --load-balancer-name "${e}" --no-cli-pager
        done
    done
)
################################################################################
#    2. Clean Up Compute Resources.
#       List EC2 Instances.
aws ec2 describe-instances \
    --filters "Name=tag:kubernetes.io/cluster/${ocpInfra},Values=owned" \
    --output table \
    --query 'Reservations[*].Instances[*].{
        ID:InstanceId,
        Name:Tags[?(Key == `"Name"`)]|[0].Value,
        State:State.Name
    }'
#       Terminate EC2 Instances.
aws ec2 terminate-instances \
    --instance-ids $(
        aws ec2 describe-instances \
            --filters "Name=tag:kubernetes.io/cluster/${ocpInfra},Values=owned" \
            --output text \
            --query 'Reservations[*].Instances[*].InstanceId'
    ) \
    --no-cli-pager
################################################################################
#    3. Clean Up Networking Resources.
#       List VPC's NAT Gateways.
aws ec2 describe-nat-gateways \
    --filter "Name=tag:kubernetes.io/cluster/${ocpInfra},Values=owned" \
    --output table \
    --query 'NatGateways[*].{
        ID:NatGatewayId, State:State, SubNet:SubnetId, VPC:VpcId
    }'
#       Delete VPC's NAT Gateways.
(
    for e in $(
        aws ec2 describe-nat-gateways \
            --filter "Name=tag:kubernetes.io/cluster/${ocpInfra},Values=owned" \
            --output text \
            --query 'NatGateways[*].NatGatewayId'
    ); do
        echo "Deleting \`${e}\`..."
        aws ec2 delete-nat-gateway --nat-gateway-id "${e}" --no-cli-pager
    done
)
#       List VPC's EndPoints.
aws ec2 describe-vpc-endpoints \
    --filters "Name=tag:kubernetes.io/cluster/${ocpInfra},Values=owned" \
    --output table \
    --query 'VpcEndpoints[*].{
        ID:VpcEndpointId, Service:ServiceName, Type:VpcEndpointType, VPC:VpcId
    }'
#       Delete VPC's EndPoints.
aws ec2 delete-vpc-endpoints --vpc-endpoint-ids "$(
    aws ec2 describe-vpc-endpoints \
        --filter "Name=tag:kubernetes.io/cluster/${ocpInfra},Values=owned" \
        --output text \
        --query 'VpcEndpoints[*].VpcEndpointId'
)" --no-cli-pager
#       List VPC's Internet Gateways.
aws ec2 describe-internet-gateways \
    --filters "Name=tag:kubernetes.io/cluster/${ocpInfra},Values=owned" \
    --output table \
    --query 'InternetGateways[*].{
        ID:InternetGatewayId,
        Name:Tags[?(Key == `"Name"`)]|[0].Value,
        VPC:Attachments[0].VpcId
    }'
#       Delete VPC's Internet Gateways.
(
    while read -r e e2; do
        echo "Detaching \`${e}\` from \`${e2}\`..."
        aws ec2 detach-internet-gateway --internet-gateway-id "${e}" --vpc-id "${e2}"
        echo "Deleting \`${e}\`..."
        aws ec2 delete-internet-gateway --internet-gateway-id "${e}" --no-cli-pager
    done 0< <(
        aws ec2 describe-internet-gateways \
            --filter "Name=tag:kubernetes.io/cluster/${ocpInfra},Values=owned" \
            --output text \
            --query 'InternetGateways[*].[InternetGatewayId, Attachments[0].VpcId]'
    )
)
#       List VPC's Security Groups.
aws ec2 describe-security-groups \
    --filters "Name=tag:kubernetes.io/cluster/${ocpInfra},Values=owned" \
    --output table \
    --query 'SecurityGroups[*].{ID:GroupId, Name:GroupName, VPC:VpcId}'
aws ec2 describe-security-groups \
    --filters "Name=tag:sigs.k8s.io/cluster-api-provider-aws/cluster/${ocpInfra},Values=owned" \
    --output table \
    --query 'SecurityGroups[*].{ID:GroupId, Name:GroupName, VPC:VpcId}'
#       Delete VPC's Security Groups.
(
    for e in $(
        aws ec2 describe-security-groups \
            --filter "Name=tag:kubernetes.io/cluster/${ocpInfra},Values=owned" \
            --output text \
            --query 'SecurityGroups[*].GroupId'
    ); do
        echo "Deleting \`${e}\`..."
        aws ec2 delete-security-group --group-id "${e}" --no-cli-pager
    done
)
(
    for e in $(
        aws ec2 describe-security-groups \
            --filter "Name=tag:sigs.k8s.io/cluster-api-provider-aws/cluster/${ocpInfra},Values=owned" \
            --output text \
            --query 'SecurityGroups[*].GroupId'
    ); do
        sgDesc="$(aws ec2 describe-security-groups --group-ids "${e}")"
        echo "Revoking Inbound Rules for \`${e}\`..."
        aws ec2 revoke-security-group-ingress \
            --group-id "${e}" \
            --ip-permissions "$(
                echo "${sgDesc}" |
                    jq -c '.SecurityGroups[0].IpPermissions'
            )" \
            --no-cli-pager
        echo "Revoking Outbound Rules for \`${e}\`..."
        aws ec2 revoke-security-group-egress \
            --group-id "${e}" \
            --ip-permissions "$(
                echo "${sgDesc}" |
                    jq -c '.SecurityGroups[0].IpPermissionsEgress'
            )" \
            --no-cli-pager
        echo "Deleting \`${e}\`..."
        aws ec2 delete-security-group --group-id "${e}" --no-cli-pager
    done
)
#       List VPC's Sub-Nets.
aws ec2 describe-subnets \
    --filters "Name=tag:kubernetes.io/cluster/${ocpInfra},Values=owned" \
    --output table \
    --query 'Subnets[*].{
        ID:SubnetId, Name:Tags[?(Key == `"Name"`)]|[0].Value, VPC:VpcId
    }'
#       Delete VPC's Sub-Nets.
(
    for e in $(
        aws ec2 describe-subnets \
            --filter "Name=tag:kubernetes.io/cluster/${ocpInfra},Values=owned" \
            --output text \
            --query 'Subnets[*].SubnetId'
    ); do
        echo "Deleting \`${e}\`..."
        aws ec2 delete-subnet --subnet-id "${e}" --no-cli-pager
    done
)
#       List VPC's Route Tables.
aws ec2 describe-route-tables \
    --filters "Name=tag:kubernetes.io/cluster/${ocpInfra},Values=owned" \
    --output table \
    --query 'RouteTables[*].{
        ID:RouteTableId, Name:Tags[?(Key == `"Name"`)]|[0].Value, VPC:VpcId
    }'
#       Delete VPC's Route Tables.
(
    for e in $(
        aws ec2 describe-route-tables \
            --filter "Name=tag:kubernetes.io/cluster/${ocpInfra},Values=owned" \
            --output text \
            --query 'RouteTables[*].RouteTableId'
    ); do
        echo "Deleting \`${e}\`..."
        aws ec2 delete-route-table --route-table-id "${e}" --no-cli-pager
    done
)
#       List VPC's EIPs.
aws ec2 describe-addresses \
    --filters "Name=tag:kubernetes.io/cluster/${ocpInfra},Values=owned" \
    --output table \
    --query 'Addresses[*].{
        ID:AllocationId, Name:Tags[?(Key == `"Name"`)]|[0].Value, "Public IP":PublicIp
    }'
#       Delete VPC's EIPs.
(
    for e in $(
        aws ec2 describe-addresses \
            --filter "Name=tag:kubernetes.io/cluster/${ocpInfra},Values=owned" \
            --output text \
            --query 'Addresses[*].AllocationId'
    ); do
        echo "Deleting \`${e}\`..."
        aws ec2 release-address --allocation-id "${e}" --no-cli-pager
    done
)
#       List VPCs.
aws ec2 describe-vpcs \
    --filters "Name=tag:kubernetes.io/cluster/${ocpInfra},Values=owned" \
    --output table \
    --query 'Vpcs[*].{ID:VpcId, Name:Tags[?(Key == `"Name"`)]|[0].Value}'
#       Delete VPCs.
(
    for e in $(
        aws ec2 describe-vpcs \
            --filter "Name=tag:kubernetes.io/cluster/${ocpInfra},Values=owned" \
            --output text \
            --query 'Vpcs[*].VpcId'
    ); do
        echo "Deleting \`${e}\`..."
        aws ec2 delete-vpc --vpc-id "${e}" --no-cli-pager
    done
)
##      List Route 53 Hosted Zones.
aws route53 list-hosted-zones \
    --output table \
    --query "HostedZones[?contains('$(
        aws resourcegroupstaggingapi get-resources \
            --tag-filters "Key=kubernetes.io/cluster/${ocpInfra},Values=owned" \
            --resource-type-filters route53:hostedzone \
            --output text \
            --query 'ResourceTagMappingList[*].ResourceARN' |
        cut -d : -f6 |
        sed 's|^|/|'
    )', Id)].{ID:Id, Name:Name, \"Num. of Records\":ResourceRecordSetCount}"
##      Delete Route 53 Hosted Zones.
(
    for e in $(
        aws resourcegroupstaggingapi get-resources \
            --tag-filters "Key=kubernetes.io/cluster/${ocpInfra},Values=owned" \
            --resource-type-filters route53:hostedzone \
            --output text \
            --query 'ResourceTagMappingList[*].ResourceARN' |
        cut -d : -f6 |
        sed 's|^|/|'
    ); do
        echo "Deleting non-default DNS records from zone \`${e}\`..."
        aws route53 change-resource-record-sets \
            --hosted-zone-id "${e}" \
            --change-batch "$(
                aws route53 list-resource-record-sets \
                    --hosted-zone-id "${e}" \
                    --query "
                        ResourceRecordSets[?((Type != 'NS') && (Type != 'SOA'))]
                    " |
                jq -c '{"Changes": [.[] | {"Action": "DELETE", "ResourceRecordSet": .}]}'
            )" \
            --no-cli-pager
        echo "Deleting \`${e}\`..."
        aws route53 delete-hosted-zone --id "/${e}" --no-cli-pager
    done
)
##      List Route 53 Main Hosted Zone Cluster Records.
(
    e="$(echo {chaos,g11n,test}'.lp.devcluster.openshift.com.')"
    while read -r e2 e3; do
        aws route53 list-resource-record-sets \
            --hosted-zone-id "${e2}" \
            --output table \
            --query "
                ResourceRecordSets[?(
                    (Type != 'NS') &&
                    (Type != 'SOA') &&
                    ends_with(Name, '${ocpClsName}.${e3}')
                )].{\"DNS Name\":AliasTarget.DNSName, Name:Name}
            "
    done 0< <(
        aws route53 list-hosted-zones \
                --output text \
                --query "HostedZones[?contains('${e}', Name)].[Id, Name]"
    )
)
##      Delete Route 53 Main Hosted Zone Cluster Records.
(
    e="$(echo {chaos,g11n,test}'.lp.devcluster.openshift.com.')"
    while read -r e2 e3; do
        e4="$(
            aws route53 list-resource-record-sets \
                --hosted-zone-id "${e2}" \
                --query "
                    ResourceRecordSets[?(
                            (Type != 'NS') &&
                            (Type != 'SOA') &&
                            ends_with(Name, '${ocpClsName}.${e3}')
                    )]
                "
        )"
        [ "${e4}" = '[]' ] && continue
        echo "Deleting Cluster DNS records from zone \`${e2}\`..."
        aws route53 change-resource-record-sets \
            --hosted-zone-id "${e2}" \
            --change-batch "$(
                jq -nc --argjson r "${e4}" \
                    '{"Changes": [$r[] | {"Action": "DELETE", "ResourceRecordSet": .}]}'
            )" \
            --no-cli-pager
    done 0< <(
        aws route53 list-hosted-zones \
                --output text \
                --query "HostedZones[?contains('${e}', Name)].[Id, Name]"
    )
)
################################################################################
#    4. Clean Up Storage Resources.
##      List S3 Buckets.
aws resourcegroupstaggingapi get-resources \
    --tag-filters "Key=kubernetes.io/cluster/${ocpInfra},Values=owned" \
    --resource-type-filters s3 \
    --output text \
    --query 'ResourceTagMappingList[*].ResourceARN' |
cut -d : -f6
##      Delete S3 Buckets.
aws s3 rb "s3://$(
    aws resourcegroupstaggingapi get-resources \
        --tag-filters "Key=kubernetes.io/cluster/${ocpInfra},Values=owned" \
        --resource-type-filters s3 \
        --output text \
        --query 'ResourceTagMappingList[*].ResourceARN' |
    cut -d : -f6
)" --force --no-cli-pager
################################################################################
#    5. Clean Up IAM Resources.
##      List IAM Instance Profiles.
aws iam list-instance-profiles \
    --output table \
    --query "InstanceProfiles[?contains('$(
        aws resourcegroupstaggingapi get-resources \
            --tag-filters "Key=kubernetes.io/cluster/${ocpInfra},Values=owned" \
            --resource-type-filters iam:instance-profile \
            --output text \
            --query 'ResourceTagMappingList[*].ResourceARN'
    )', Arn)].{
        ID:InstanceProfileId, Name:InstanceProfileName, Roles:Roles[*].RoleName
    }"
##      Delete IAM Instance Profiles and Roles.
(
    for e in $(
        aws resourcegroupstaggingapi get-resources \
            --tag-filters "Key=kubernetes.io/cluster/${ocpInfra},Values=owned" \
            --resource-type-filters iam:instance-profile \
            --output text \
            --query 'ResourceTagMappingList[*].ResourceARN'
    ); do
        while IFS='|' read -r e2 e3; do
            IFS=, read -ra e3 0<<<"${e3}"
            for e4 in "${e3}"; do
                echo "Detaching IAM Role \`${e4}\` from IAM Instance Profile \`${e2}\`."
                aws iam remove-role-from-instance-profile \
                    --instance-profile-name "${e2}" \
                    --role-name "${e4}" \
                    --no-cli-pager
            done
            echo "Deleting IAM Instance Profile \`${e2}\`."
            aws iam delete-instance-profile \
                --instance-profile-name "${e2}" \
                --no-cli-pager
            while read -r e2; do
                echo "Detaching IAM Permission Policies \`${e2}\` from IAM Role \`${e4}\`."
                aws iam detach-role-policy \
                    --role-name "${e4}" \
                    --policy-arn "${e2}" \
                    --no-cli-pager
            done 0< <(
                aws iam list-attached-role-policies --role-name "${e4}" \
                    --output text --query 'AttachedPolicies[*].[PolicyArn]'
            )
            while read -r e2; do
                echo "Deleting AIM Inline Permission Policies \`${e2}\` from IAM Role \`${e4}\`."
                aws iam delete-role-policy \
                    --role-name "${e4}" \
                    --policy-name "${e2}" \
                    --no-cli-pager
            done 0< <(
                aws iam list-role-policies --role-name "${e4}" \
                    --output text --query 'PolicyNames[*].[@]'
            )
            echo "Deleting IAM Role \`${e4}\`."
            aws iam delete-role --role-name "${e4}" --no-cli-pager
        done 0< <(
            aws iam list-instance-profiles \
                --query "InstanceProfiles[?(Arn == '${e}')].{
                    Name:InstanceProfileName, Roles:Roles[*].RoleName
            }" |
            jq -r '.[] | .Name + "|" + (.Roles | join(","))'
        )
    done
)
################################################################################
#    6. Clean Up Check.
#       List EBS Volumes.
aws ec2 describe-volumes \
    --filters "Name=tag:kubernetes.io/cluster/${ocpInfra},Values=owned" \
    --output table \
    --query 'Volumes[*].{ID:VolumeId, Size:Size, State:State}'
#       List VPC's ENIs.
aws ec2 describe-network-interfaces \
    --filters "Name=tag:kubernetes.io/cluster/${ocpInfra},Values=owned" \
    --output table \
    --query 'NetworkInterfaces[*].{
        ID:NetworkInterfaceId, Type:InterfaceType, VPC:VpcId
    }'
#       List Any Resources.
aws resourcegroupstaggingapi get-resources \
    --tag-filters "Key=kubernetes.io/cluster/${ocpInfra},Values=owned" \
    --output table \
    --query 'ResourceTagMappingList[*].ResourceARN'
aws resourcegroupstaggingapi get-resources \
    --tag-filters "Key=sigs.k8s.io/cluster-api-provider-aws/cluster/${ocpInfra},Values=owned" \
    --output table \
    --query 'ResourceTagMappingList[*].ResourceARN'
```
</details>
