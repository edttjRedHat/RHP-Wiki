# Libraries
## Virtual Machine Instance
<details><summary>Get VMI Information</summary>

```shell
function _olp--virt--infra--VMIinfo () {
    {
#       echo -e "NAMESPACE\tVMI\tIPs(primIP|MAC|IPaddr...;...G')"
        oc get VirtualMachineInstances $(
            oc auth can-i list vmi -A 1> /dev/null 2>&1 && printf -- '-A'
        ) -o json |
        jq -r '
            .items[] |
            select(.status.phase == "Running") |
            (
                .status.interfaces |
                map(select(.ipAddress)) |
                map("\(.ipAddress)|\(.mac)|\(.ipAddresses | join(","))") |
                join(";")
            ) as $IPs |
            select($IPs != "") |
            "\(.metadata.namespace)\t\(.metadata.name)\t\(.status.nodeName)\t\($IPs)"
        ' |
        sort -k 1,1 -k 2,2 -t $'\t'
    } | column -ts $'\t' | fzf
}
```
</details>

<details><summary>Select VMI</summary>

```shell
function _olp--virt--infra--GetVMI () {
    _olp--virt--infra--VMIinfo | sed -E 's|^(\S+)\s+(\S+).+|-n "\1" "\2"|'
}
```
</details>


# Functions
## Shell Access
<details><summary>VMI</summary>

```shell
function olp--virt--infr--VMI--con () {
    typeset pFwd="${1:-${OLP__VIRT__SSH_PORT:-9022:22}}"; (($#)) && shift

    typeset -i lPort="${pFwd%%:*}" rPort="${pFwd##*:}"

    typeset vmiTarget="$(_olp--virt--infra--GetVMI)"

    if ((rPort)); then
        vmiTarget="$(echo "${vmiTarget}" | sed -E 's|" "|" "vmi/|')"
        if ((lPort)); then
            typeset vctlPortFwdOpts="${1:-${OLP__VIRT__VCTL_PORTFWD_OPTS:-()}}"; (($#)) && shift
            typeset usrName="${1:-core}"; (($#)) && shift
            typeset sshOpts="${1:-${K8S__SSH_OPTS:-()}}"; (($#)) && shift

            typeset -a vctlPortFwdOpts="${vctlPortFwdOpts}"
            typeset -a sshOpts="${sshOpts}"

            usrName="${usrName@Q}"

            eval "
                ssh -t -p ${lPort} \
                    -o UserKnownHostsFile=/dev/null \
                    -o StrictHostKeyChecking=no \
                    ${K8S__SSH__ID:+-i ${K8S__SSH__ID@Q}} \
                    -o \"\$(
echo 'ProxyCommand=virtctl port-forward --stdio=true'\
    '${vmiTarget} \"%p:${rPort}\"'\
    \"\${vctlPortFwdOpts[@]@Q}\" \
                    )\" \
                    ${usrName:+-o User=${usrName@Q}} ${sshOpts[@]@Q} \
                    localhost "${@@Q}"
            "
        else
            typeset vctlSshOpts="${1:-${OLP__VIRT__VCTL_SSH_OPTS:-()}}"; (($#)) && shift
            typeset usrName="${1:-core}"; (($#)) && shift
            typeset sshOpts="${1:-${K8S__SSH_OPTS:-()}}"; (($#)) && shift

            typeset -a vctlSshOpts="${vctlSshOpts}"
            typeset -a sshOpts="${sshOpts}"

            [ -n "${usrName}" ] && vctlSshOpts+=(-l "${usrName}")
            (($#)) && vctlSshOpts+=(-c "${1}")

            eval "
                virtctl ssh \
                    ${K8S__SSH__ID:+-i ${K8S__SSH__ID@Q}} \
                    -t '-t' \
                    -t '-o UserKnownHostsFile=/dev/null' \
                    -t '-o StrictHostKeyChecking=no' \
                    $(for e in "${sshOpts[@]}"; do echo -n "-t ${e@Q} "; done) \
                    ${vmiTarget} ${vctlSshOpts[@]@Q}
            "
        fi
    else
        typeset vctlConOpts="${1:-${OLP__VIRT__VCTL_CON_OPTS:-()}}"; (($#)) && shift

        typeset -a vctlConOpts="${vctlConOpts}"

        eval "virtctl console ${vmiTarget} ${vctlConOpts[@]@Q}"
    fi
}
```
</details>

## File Transfer
<details><summary>VMI</summary>

```shell
function olp--virt--infr--VMI--scp () {
    typeset sPaths="${1}"; (($#)) && shift
    typeset tPath="${1}"; (($#)) && shift
    typeset pFwd="${1:-${OLP__VIRT__SCP_PORT:-9122:22}}"; (($#)) && shift
    typeset vctlPortFwdOpts="${1:-${OLP__VIRT__VCTL_PORTFWD_OPTS:-()}}"; (($#)) && shift
    typeset usrName="${1:-core}"; (($#)) && shift
    typeset scpOpts="${1:-${K8S__SCP_OPTS:-()}}"; (($#)) && shift

    typeset -i i=0
    typeset -i lPort="${pFwd%%:*}" rPort="${pFwd##*:}"
    typeset -a sPaths="${sPaths}"
    typeset -a vctlPortFwdOpts="${vctlPortFwdOpts}"
    typeset -a scpOpts="${scpOpts}"

    typeset vmiTarget="$(_olp--virt--infra--GetVMI)"

    for i in "${!sPaths[@]}"; do
        [ "${sPaths[${i}]:0:1}" = ':' ] &&
        sPaths[${i}]="localhost${sPaths[${i}]}"
    done
    [ "${tPath:0:1}" = ':' ] && tPath="localhost${tPath}"
    usrName="${usrName@Q}"

    eval "
        scp -P ${lPort} \
            -o UserKnownHostsFile=/dev/null \
            -o StrictHostKeyChecking=no \
            ${K8S__SSH__ID:+-i ${K8S__SSH__ID@Q}} \
            -o \"\$(
echo 'ProxyCommand=virtctl port-forward --stdio=true'\
    '${vmiTarget} \"%p:${rPort}\"'\
    \"\${vctlPortFwdOpts[@]@Q}\" \
            )\" \
            ${usrName:+-o User=${usrName@Q}} ${sshOpts[@]@Q} \
            ${sPaths[@]@Q} ${tPath@Q}
    "
}
```
</details>
