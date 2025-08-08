# OCP
```shell
(
    oc debug "node/$({
#       echo -e "NAME\tROLES"
        oc get nodes --no-headers | awk '{print $1 "\t" $3}' | sort -k 1,1 -t $'\t'
    } | column -ts $'\t' | fzf | sed -E 's/\s+\S+$//')"
)
```

# Bare Metal
```shell
(
    ssh \
        -o UserKnownHostsFile=/dev/null \
        -o StrictHostKeyChecking=no \
        -i ~/.ssh/openshift-qe.pem \
        -o User=core "$({
#           echo -e "NAME\tROLES"
            oc get nodes --no-headers | awk '{print $1 "\t" $3}' | sort -k 1,1 -t $'\t'
        } | column -ts $'\t' | fzf | sed -E 's/\s+\S+$//')"
)
```

# AWS
```shell
(
    aws ssm start-session --target "$({
#       echo -e "NAME\tROLES\tAWS EC2 VM INSTANCE ID"
        join -t $'\t' -1 1 -2 1 -o 1.1,1.2,2.2 \
            <(oc get nodes --no-headers | awk '{print $1 "\t" $3}' | sort -k 1,1 -t $'\t') \
            <(
                oc get nodes -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.providerID}{"\n"}{end}' |
                awk '{split($2,a,"/"); print $1 "\t" a[5]}' |
                sort -k 1,1 -t $'\t'
            )
    } | column -ts $'\t' | fzf | sed -E 's/^(\S+\s+){2}//')"
)
```
