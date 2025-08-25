# Bare Metal
TBD


# AWS
## Installation
<details><summary>IPI</summary>

```shell
# OCP Installation IPI on AWS.
__SHELL=0 \
    _OCP__INSTLR_ACTION=1 \
    _OCP__CLUSTER_DIR='...ocpClusterDir...' \
    _OCP__INSTLR_LOG_LEVEL=info \
    _OCP__INSTLR_DIR='...ocpInstallerDir...' \
    _AWS__USE_SSO=0 \
    _AWS__RESET_PROFILE=0 \
    _AWS__PROFILE=ocp \
    _AWS__ROLE_NAME_SFX=poweruser \
   x_AWS__SES_TO=3600 \
    _BW__NOTE_NAME='note.AWS--IAMuser--OCPinstaller' \
    _RC_SRCS='(...srcDirsOfRCfiles...)' \
    BW_SESSION="${BW_SESSION:+$([ -f "${BW_SESSION}" ] && cat "${BW_SESSION}" || echo "${BW_SESSION}")}" \
    BW_SESSION="$((bw status | grep -q '"status":"unlocked"') && echo "${BW_SESSION}" || bw unlock --raw || bw login --raw)" \
    AWS_REGION=us-east-1 \
    AWS_ACCOUNT_ID=624914081466 \
    AWS_CONFIG_FILE="${HOME}/.aws/config" \
    AWS_SHARED_CREDENTIALS_FILE="${HOME}/.aws/credentials" \
    bash -ec "$(cat - 0<<'cmdEOF'
        [ -n "${BW_SESSION}" ] && bw sync || {
            echo 'You do NOT have an active and sync:ed BitWarden Session!!!'
            exit 1
        }
        ((__SHELL)) && exec bash    # Do NOT forget to exit the interactive session!!!

        if ((_AWS__USE_SSO)); then
            shopt -s expand_aliases
            ((_AWS__RESET_PROFILE)) && {
                # Clean up the AWS CLI profile.
                sed -i "/^\[profile ${_AWS__PROFILE}\]/,/^\[/ {/^\[profile ${_AWS__PROFILE}\]/{d;b};/^\[/"\!"d}" "${AWS_CONFIG_FILE}"
                sed -i "/^\[${_AWS__PROFILE}\]/,/^\[/ {/^\[${_AWS__PROFILE}\]/{d;b};/^\[/"\!"d}" "${AWS_SHARED_CREDENTIALS_FILE}"
            }
            kinit
            aws-saml.py \
                --region "${AWS_REGION}" \
                --target-profile "${_AWS__PROFILE}" \
                --target-role "${AWS_ACCOUNT_ID}-${_AWS__ROLE_NAME_SFX}" \
                ${_AWS__SES_TO:+--session-duration "${_AWS__SES_TO}"}
            alias aws='\aws --profile "${_AWS__PROFILE}"'
        else
            eval "$(
                bw get notes "${_BW__NOTE_NAME}" || {
                    echo "You may NOT have access to BitWarden Note \`${_BW__NOTE_NAME}\`." 1>&2
                    echo false
                }
            )"
        fi
#       aws configure set aws_access_key_id "${AWS_ACCESS_KEY_ID}" --profile "${_AWS__PROFILE}"
#       aws configure set aws_secret_access_key "${AWS_SECRET_ACCESS_KEY}" --profile "${_AWS__PROFILE}"
        aws configure list
#       cat "${AWS_CONFIG_FILE}" "${AWS_SHARED_CREDENTIALS_FILE}"
#       eval "$(aws configure export-credentials --format env)"
        aws sts get-caller-identity

        function openshift-install () {
            \command "${_OCP__INSTLR_DIR}/openshift-install" \
                --dir "${_OCP__CLUSTER_DIR}/" \
                ${_OCP__INSTLR_LOG_LEVEL:+--log-level "${_OCP__INSTLR_LOG_LEVEL}"} \
                "$@"
        }

        case ${_OCP__INSTLR_ACTION} in
          (-2|0|2)  openshift-install destroy bootstrap || true;;&
          (-2|-1|2) openshift-install destroy cluster || exit 1;;&
          (-2|2)    rm -rf "${_OCP__CLUSTER_DIR}/";;&
          (1|2)
            openshift-install create cluster
            bash -iec "$(cat - 0<<'cmd1EOF'
                typeset e=
                eval "typeset -a rcSrcs=${_RC_SRCS}"
                [ -e "${_OCP__CLUSTER_DIR}/kubecfg" ] ||
                    cp "${_OCP__CLUSTER_DIR}/auth/kubeconfig" "${_OCP__CLUSTER_DIR}/kubecfg"
                mkdir -p "${_OCP__CLUSTER_DIR}/rc"
                for e in "${rcSrcs[@]}"; do
                    [ -d "${e}" ] && e="$(__RelPhyPath "${_OCP__CLUSTER_DIR}/rc" "${e}")"
                    (
                        cd "${_OCP__CLUSTER_DIR}/rc"
                        find "${e}/" -type f -exec bash -ec "$(cat - 0<<'cmd2EOF'
typeset p='{}' m=
typeset f="${p##*/}"
if [[ "${f}" == *..* ]]; then
    m="${f#*..}"
    m="${m//.//}"
    [[ "${_OCP__CLUSTER_DIR}" == "${m}"* ]] && ln -sf "${p}" "${f%%..*}"
else
    ln -sf "${p}"
fi
cmd2EOF
                        )" \;
                    )
                done
cmd1EOF
            )"
            ;;
          (i)
            # Interactive Session.
            _OCP__INSTLR_DIR="$(CDPATH= \command cd -L "${_OCP__INSTLR_DIR}"; \command pwd)"
            export -f openshift-install
            mkdir -p "${_OCP__CLUSTER_DIR}"; cd "${_OCP__CLUSTER_DIR}/"
            exec bash   # Do NOT forget to exit the interactive session!!!
            ;;
        esac
cmdEOF
    )"; echo $?
```
</details>

## Post Installation
<details><summary>Install AWS EC2 SSM Agent on Nodes</summary>

```shell
# Enabling SSM Access for OCP Nodes on AWS (Post-Install).
__SHELL=0 \
    _AWS__USE_SSO=0 \
    _AWS__RESET_PROFILE=0 \
    _AWS__PROFILE=ocp \
    _AWS__ROLE_NAME_SFX=poweruser \
   x_AWS__SES_TO=3600 \
    _BW__NOTE_NAME='note.AWS--IAMuser--OCPinstaller' \
    KUBECONFIG="${KUBECONFIG:-${HOME}/.kube/config}" \
    BW_SESSION="${BW_SESSION:+$([ -f "${BW_SESSION}" ] && cat "${BW_SESSION}" || echo "${BW_SESSION}")}" \
    BW_SESSION="$((bw status | grep -q '"status":"unlocked"') && echo "${BW_SESSION}" || bw unlock --raw || bw login --raw)" \
    AWS_REGION=us-east-1 \
    AWS_ACCOUNT_ID=624914081466 \
    AWS_CONFIG_FILE="${HOME}/.aws/config" \
    AWS_SHARED_CREDENTIALS_FILE="${HOME}/.aws/credentials" \
    bash -c "$(cat - 0<<'cmdEOF'
        [ -n "${BW_SESSION}" ] && bw sync || {
            echo 'You do NOT have an active and sync:ed BitWarden Session!!!'
            exit 1
        }
        ((__SHELL)) && exec bash    # Do NOT forget to exit the interactive session!!!

        typeset e= iamIP= iamRN=

        if ((_AWS__USE_SSO)); then
            shopt -s expand_aliases
            ((_AWS__RESET_PROFILE)) && {
                # Clean up the AWS CLI profile.
                sed -i "/^\[profile ${_AWS__PROFILE}\]/,/^\[/ {/^\[profile ${_AWS__PROFILE}\]/{d;b};/^\[/"\!"d}" "${AWS_CONFIG_FILE}"
                sed -i "/^\[${_AWS__PROFILE}\]/,/^\[/ {/^\[${_AWS__PROFILE}\]/{d;b};/^\[/"\!"d}" "${AWS_SHARED_CREDENTIALS_FILE}"
            }
            kinit
            aws-saml.py --region "${AWS_REGION}" --target-profile "${_AWS__PROFILE}" --target-role "${AWS_ACCOUNT_ID}-${_AWS__ROLE_NAME_SFX}" ${_AWS__SES_TO:+--session-duration "${_AWS__SES_TO}"}
            alias aws='\aws --profile "${_AWS__PROFILE}"'
        else
            eval "$(
                bw get notes "${_BW__NOTE_NAME}" || {
                    echo "You may NOT have access to BitWarden Note \`${_BW__NOTE_NAME}\`." 1>&2
                    echo false
                }
            )"
        fi
#       aws configure set aws_access_key_id "${AWS_ACCESS_KEY_ID}" --profile "${_AWS__PROFILE}"
#       aws configure set aws_secret_access_key "${AWS_SECRET_ACCESS_KEY}" --profile "${_AWS__PROFILE}"
        aws configure list
#       cat "${AWS_CONFIG_FILE}" "${AWS_SHARED_CREDENTIALS_FILE}"
#       eval "$(aws configure export-credentials --format env)"
        aws sts get-caller-identity

        # Adding IAM Permission Policy `AmazonSSMManagedInstanceCore` to the EC2 Instance IAM Role to allow connecting to the VM via SSM.
        for e in $(oc get nodes -o jsonpath='{range .items[*]}{.spec.providerID}{"\n"}{end}'); do
            iamIP="$(aws ec2 describe-instances --instance-ids "${e##*/}" --query 'Reservations[0].Instances[0].IamInstanceProfile.Arn' --output text)"
            iamRN="$(aws iam get-instance-profile --instance-profile-name "${iamIP##*/}" --query 'InstanceProfile.Roles[0].RoleName' --output text)"
#           aws iam list-role-policies --role-name "${iamRN}" --query 'PolicyNames[]' --output text # Inline Policy.
            {   # Attached Policy.
                aws iam list-attached-role-policies --role-name "${iamRN}" --query 'AttachedPolicies[].PolicyName' --output text |
                grep -qE '^AmazonSSMManagedInstanceCore$'
            } || aws iam attach-role-policy --role-name "${iamRN}" --policy-arn 'arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore'
        done

        for e in {master,worker}; do
            oc apply -f - 0<<ocEOF
apiVersion: machineconfiguration.openshift.io/v1
kind: MachineConfig
metadata:
    name: 99999-00--${e}--ssm-agent-install
    labels:
        machineconfiguration.openshift.io/role: ${e}
spec:
    config:
        ignition:
            version: $(oc get MachineConfigs -o jsonpath='{range .items[*]}{.spec.config.ignition.version}{"\n"}{end}' | grep -vE '^\$' | head -n 1)
        storage: {} # Required empty object
        systemd:
            units:
              - name: aws-ec2--ssm-agent--install.service
                enabled: true
                contents: |
                    [Unit]
                    Description=Install AWS EC2 SSM Agent
                    After=network-online.target
                    Wants=network-online.target

                    [Service]
                    Type=oneshot
                    RemainAfterExit=yes
                    ExecStart=/usr/bin/sh -c ' \\
                        # Determine the correct the architecture string. \\
                        typeset arch="\$\$(/usr/bin/uname -m)"; \\
                        case \$\${arch} in \\
                        (x86_64)  arch=amd64;; \\
                        (aarch64) arch=arm64;; \\
                        esac; \\
                        if /usr/bin/rpm -q amazon-ssm-agent; then \\
                            /usr/bin/systemctl enable amazon-ssm-agent.service; \\
                            /usr/bin/systemctl start amazon-ssm-agent.service; \\
                        else \\
                            # Remove any broken stub agent if present, ignore if not found. \\
                            /usr/bin/rpm-ostree override remove amazon-ssm-agent || true; \\
                            # Install the agent. \\
                            /usr/bin/rpm-ostree install "https://s3.amazonaws.com/ec2-downloads-windows/SSMAgent/latest/linux_\$\${arch}/amazon-ssm-agent.rpm"; \\
                            /usr/bin/systemctl reboot; \\
                        fi; \\
                    '

                    [Install]
                    WantedBy=multi-user.target
ocEOF
        done
cmdEOF
    )"; echo $?
# Monitor the MCP Deployment.
(
    function CheckMCPstatus () {
        typeset poolName="${1}"; (($#)) && shift
        typeset poolSign="${1}"; (($#)) && shift
        typeset mcpAction= mcpType= mcpCurState=
        typeset -i i=2 s=0

        while ((i--)); do
            case ${i} in
              (1)   mcpAction=start     mcpType=Updated     ;;
              (0)   mcpAction=finish    mcpType=Updating    ;;
            esac

            echo -n $'\n'"Waiting for MCP ${poolName} pool to ${mcpAction} updating${poolSign}${poolSign}${poolSign}"
            while true; do
                while true; do
                    read -rt 5 mcpCurState; s=$?
                    if {
                        ((s > 128)) ||
                        { ((! s)) && [ "${mcpCurState}" != False ]; }

                    }; then
                        echo -n "${poolSign}"
                    else
                        kill $! 2> /dev/null
                        ((s)) && break || break 2
                    fi
                done 0< <(
                    oc get "MachineConfigPools/${poolName}" \
                        -o jsonpath='{.status.conditions[?(@.type=="'"${mcpType}"'")].status}{"\n"}' --watch
                )
            done
        done
        echo
    }

    CheckMCPstatus worker ':' &
    sleep 3
    CheckMCPstatus master '.'
    wait

    oc get MachineConfigPools
); echo $?
# Manual monitoring.
oc get Nodes,MachineConfigPools,MachineConfigs
# Reboot MCP if it stuck.
oc adm reboot-machine-config-pool MachineConfigPools/{master,worker}
# Check the MCO logs.
oc -n openshift-machine-config-operator logs -f "$(oc -n openshift-machine-config-operator get pods -l 'k8s-app=machine-config-controller' -o name)"
# Delete MCs:
oc delete MachineConfig/99999-00--{master,worker}--ssm-agent-install
```
</details>
