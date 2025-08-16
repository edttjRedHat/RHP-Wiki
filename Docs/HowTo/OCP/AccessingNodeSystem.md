# Libraries
## Select Node
<details><summary>OCP</summary>

```shell
function _ocp--infra--GetNode () {
    {
#       echo -e "NAME\tROLES"
        oc get nodes --no-headers | awk '{print $1 "\t" $3}' | sort -k 1,1 -t $'\t'
    } | column -ts $'\t' | fzf | sed -E 's/\s+\S+$//'
}
```
</details>
<details><summary>Bare Metal</summary>

```shell
function _k8s--infra-bm--GetNode () {
    {
#       echo -e "NAME\tROLES"
        kubectl get nodes --no-headers | awk '{print $1 "\t" $3}' | sort -k 1,1 -t $'\t'
    } | column -ts $'\t' | fzf | sed -E 's/\s+\S+$//'
}
```
</details>
<details><summary>AWS</summary>

```shell
function _k8s--infra-aws--GetNode () {
    {
#       echo -e "NAME\tROLES\tAWS EC2 VM INSTANCE ID"
        join -t $'\t' -1 1 -2 1 -o 1.1,1.2,2.2 \
            <(kubectl get nodes --no-headers | awk '{print $1 "\t" $3}' | sort -k 1,1 -t $'\t') \
            <(
                kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.providerID}{"\n"}{end}' |
                awk '{split($2,a,"/"); print $1 "\t" a[5]}' |
                sort -k 1,1 -t $'\t'
            )
    } | column -ts $'\t' | fzf | sed -E 's/^(\S+\s+){2}//'
}
```
</details>


# Functions
## Shell Access
<details><summary>OCP</summary>

```shell
function ocp--infra--node--con () {
    typeset ocDbgOpts="${1:-${K8S__OC_DBG_OPTS:-()}}"; (($#)) && shift

    typeset -a ocDbgOpts="${ocDbgOpts}"

    if (($#)); then
        if { (($# == 1)) && [ -z "${1}" ] ; }; then
            eval 'oc debug "node/$(_ocp--infra--GetNode)" '"${ocDbgOpts[@]@Q} -t -- chroot /host/"
        else
            eval 'oc debug "node/$(_ocp--infra--GetNode)" '"${ocDbgOpts[@]@Q} -t -- chroot /host/ ${@@Q}"
        fi
    else
        eval 'oc debug "node/$(_ocp--infra--GetNode)" '"${ocDbgOpts[@]@Q} -t -- sh -c 'chroot /host/ \"\${SHELL}\"'"
    fi
}
```
</details>
<details><summary>Bare Metal</summary>

```shell
function k8s--infra-bm--node--con () {
    typeset usrName="${1:-core}"; (($#)) && shift
    typeset sshOpts="${1:-${K8S__SSH_OPTS:-()}}"; (($#)) && shift

    typeset -a sshOpts="${sshOpts}"

    usrName="${usrName@Q}"

    eval "
        ssh -t \
            -o UserKnownHostsFile=/dev/null \
            -o StrictHostKeyChecking=no \
            ${K8S__SSH__ID:+-i ${K8S__SSH__ID@Q}} \
            ${usrName:+-o User=${usrName@Q}} ${sshOpts[@]@Q} \
            \"\$(_k8s--infra-bm--GetNode)\" "${@@Q}"
    "
}
```
</details>
<details><summary>AWS</summary>

```shell
function k8s--infra-aws--node--con () {
    typeset pFwd="${1:-${K8S__SSH_PORT:-8022:22}}"; (($#)) && shift
    typeset ssmStartSesOpts="${1:-${K8S__SSM_STARTSES_OPTS-()}}"; (($#)) && shift

    typeset awsPID= ssmPID=
    typeset -i i=0
    typeset -i lPort="${pFwd%%:*}" rPort="${pFwd##*:}"
    typeset -a ssmStartSesOpts="${ssmStartSesOpts}"

    typeset ssmTarget="$(_k8s--infra-aws--GetNode)"

    if ((lPort)); then
        typeset usrName="${1:-core}"; (($#)) && shift
        typeset sshOpts="${1:-${K8S__SSH_OPTS:-()}}"; (($#)) && shift

        typeset -a sshOpts="${sshOpts}"

        usrName="${usrName@Q}"

        (   # Silence the Job Control messages and allow `trap`.
            eval "
                aws ssm start-session \
                    --target ${ssmTarget@Q} \
                    --document-name 'AWS-StartPortForwardingSession' \
                    --parameters 'portNumber=${rPort},localPortNumber=${lPort}' \
                    ${ssmStartSesOpts[@]@Q} 1> /dev/null & awsPID=\$!
            "
            i=15
            while {
                ((i--)) &&
                ! { echo 1> /dev/tcp/localhost/${pFwd}; } 2> /dev/null;
            }; do sleep 1; done
            ssmPID="$(pgrep -P ${awsPID})"
            trap 'kill -s INT ${ssmPID}; wait ${awsPID}' EXIT
            eval "
                ssh -t -p ${lPort} \
                    -o UserKnownHostsFile=/dev/null \
                    -o StrictHostKeyChecking=no \
                    ${K8S__SSH__ID:+-i ${K8S__SSH__ID@Q}} \
                    ${usrName:+-o User=${usrName@Q}} ${sshOpts[@]@Q} \
                    localhost "${@@Q}"
            "
        )
    elif (($#)); then
        if { (($# == 1)) && [ -z "${1}" ] ; }; then
            eval "aws ssm start-session --target "${ssmTarget@Q}" ${ssmStartSesOpts[@]@Q}"
        else
            eval "
                aws ssm start-session \
                    --target ${ssmTarget@Q} \
                    --document-name 'AWS-StartInteractiveCommand' \
                    --parameters "'"$(
                        jq -nc --arg c "$(echo "$@")" "{\"command\": [\$c]}"
                    )"'" \
                    ${ssmStartSesOpts[@]@Q}
            "
        fi
    else
        eval "
            aws ssm start-session \
                --target ${ssmTarget@Q} \
                --document-name 'AWS-StartInteractiveCommand' \
                --parameters "'"$(
                    jq -nc --arg c "sh -c \"\${SHELL}\"" "{\"command\": [\$c]}"
                )"'" \
                ${ssmStartSesOpts[@]@Q}
        "
    fi
}

```
</details>

## File Transfer
<details><summary>OCP (Machine Config Operator)</summary>

```shell
function ocp--MachineConfig--storage.files--get () {
    typeset obj="${1}"; (($#)) && shift
    typeset path="${1}"; (($#)) && shift

    oc get "MachineConfig/${obj}" -o yaml |
        _YQ_P="${path}" yq -r '
            .spec.config.storage.files[] |
            select(.path == env(_YQ_P)) |
            .contents.source
        ' |
        __decode--dataURL
}

function ocp--MachineConfig--storage.files--set () {
    typeset obj="${1}"; (($#)) && shift
    typeset path="${1}"; (($#)) && shift
    typeset inFile="${1}"; (($#)) && shift

    typeset content="$(cat "${inFile}" | __encode--dataURL)"

    oc get "MachineConfig/${obj}" -o yaml |
        _YQ_P="${path}" _YQ_C="${content}" yq -r '
            (
                .spec.config.storage.files[] |
                select(.path == env(_YQ_P))
            ).contents.source=env(_YQ_C) |
            .metadata={"name": .metadata.name, "labels": .metadata.labels}
        '
}
```
</details>
<details><summary>Bare Metal</summary>

```shell
function k8s--infra-bm--node--scp () {
    typeset sPaths="${1}"; (($#)) && shift
    typeset tPath="${1}"; (($#)) && shift
    typeset usrName="${1:-core}"; (($#)) && shift
    typeset scpOpts="${1:-${K8S__SCP_OPTS:-()}}"; (($#)) && shift

    typeset -i i=0
    typeset -a sPaths="${sPaths}"
    typeset -a scpOpts="${scpOpts}"

    typeset rmtHost="$(_k8s--infra-bm--GetNode)"

    for i in "${!sPaths[@]}"; do
        [ "${sPaths[${i}]:0:1}" = ':' ] &&
        sPaths[${i}]="${rmtHost}${sPaths[${i}]}"
    done
    [ "${tPath:0:1}" = ':' ] && tPath="${rmtHost}${tPath}"
    usrName="${usrName@Q}"

    eval "
        scp \
            -o UserKnownHostsFile=/dev/null \
            -o StrictHostKeyChecking=no \
            ${K8S__SSH__ID:+-i ${K8S__SSH__ID@Q}} \
            ${usrName:+-o User=${usrName@Q}} ${sshOpts[@]@Q} \
            ${sPaths[@]@Q} ${tPath@Q}
    "
}
```
</details>
<details><summary>AWS</summary>

```shell
function k8s--infra-aws--node--scp () {(
    typeset sPaths="${1}"; (($#)) && shift
    typeset tPath="${1}"; (($#)) && shift
    typeset pFwd="${1:-${K8S__SCP_PORT:-8122:22}}"; (($#)) && shift
    typeset ssmStartSesOpts="${1:-${K8S__SSM_STARTSES_OPTS-()}}"; (($#)) && shift
    typeset usrName="${1:-core}"; (($#)) && shift
    typeset scpOpts="${1:-${K8S__SCP_OPTS:-()}}"; (($#)) && shift

    typeset awsPID= ssmPID=
    typeset -i i=0
    typeset -i lPort="${pFwd%%:*}" rPort="${pFwd##*:}"
    typeset -a sPaths="${sPaths}"
    typeset -a ssmStartSesOpts="${ssmStartSesOpts}"
    typeset -a scpOpts="${scpOpts}"

    typeset ssmTarget="$(_k8s--infra-aws--GetNode)"

    for i in "${!sPaths[@]}"; do
        [ "${sPaths[${i}]:0:1}" = ':' ] &&
        sPaths[${i}]="localhost${sPaths[${i}]}"
    done
    [ "${tPath:0:1}" = ':' ] && tPath="localhost${tPath}"
    usrName="${usrName@Q}"

    eval "
        aws ssm start-session \
            --target ${ssmTarget@Q} \
            --document-name 'AWS-StartPortForwardingSession' \
            --parameters 'portNumber=${rPort},localPortNumber=${lPort}' \
            ${ssmStartSesOpts[@]@Q} 1> /dev/null & awsPID=\$!
    "
    i=15
    while {
        ((i--)) &&
        ! { echo 1> /dev/tcp/localhost/${pFwd}; } 2> /dev/null;
    }; do sleep 1; done
    ssmPID="$(pgrep -P ${awsPID})"
    trap 'kill -s INT ${ssmPID}; wait ${awsPID}' EXIT
    eval "
        scp -P ${lPort} \
            -o UserKnownHostsFile=/dev/null \
            -o StrictHostKeyChecking=no \
            ${K8S__SSH__ID:+-i ${K8S__SSH__ID@Q}} \
            ${usrName:+-o User=${usrName@Q}} ${scpOpts[@]@Q} \
            ${sPaths[@]@Q} ${tPath@Q}
    "
)}
```
</details>

## Remote Execution (Asyncronous)
<details><summary>AWS</summary>

```shell
function k8s--infra-aws--node--cmd () {
    typeset ssmSendCmdOpts="${1:-${K8S__SSM_SENDCMD_OPTS:-()}}"; (($#)) && shift

    (($#)) || return 1

    typeset cStat=
    typeset -a ssmSendCmdOpts="${ssmSendCmdOpts}"

    typeset ssmTarget="$(_k8s--infra-aws--GetNode)"
    typeset cmdID="$(
        eval "
            aws ssm send-command \
                --targets 'Key=instanceids,Values='${ssmTarget@Q} \
                --document-name 'AWS-RunShellScript' \
                --parameters "'"$(
                    jq -nc --args "{\"commands\": \$ARGS.positional}" -- "$@"
                )"'" \
                --output text --query 'Command.CommandId'
                ${ssmStartSesOpts[@]@Q}
            "
    )"

    while true; do
        cStat="$(
            aws ssm get-command-invocation \
                --command-id "${cmdID}" --instance-id "${ssmTarget}" \
                --output text --query 'Status'
        )"
        [ "${cStat}" = InProgress ] || break
        echo "${cStat}"
        sleep 2
    done
    cStat="$(
        aws ssm get-command-invocation \
            --command-id "${cmdID}" --instance-id "${ssmTarget}"
    )"

    echo "Command Invocation: ${cmdID} - $(
        echo "${cStat}" | jq -r '"\(.Status) - \(.ResponseCode)"'
    )"
    echo "STDIN : $(
        aws ssm list-commands \
            --command-id "${cmdID}" \
            --query 'Commands[0].Parameters.commands[]' |
        jq -r '.[]'
    )"
    echo "STDOUT: $(echo "${cStat}" | jq -r '.StandardOutputContent')"
    echo "STDERR: $(echo "${cStat}" | jq -r '.StandardErrorContent')"
}
```
</details>
