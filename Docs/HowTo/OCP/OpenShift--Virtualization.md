# Libraries
## Virtual Machine Instance
<details><summary>Get VMI Information</summary>

```shell
function _olp--virt--infra--VMIsInfo () {
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
    } | column -ts $'\t' | fzf -m
}
```
</details>

<details><summary>Select VMI</summary>

```shell
function _olp--virt--infra--GetVMIs () {
    _olp--virt--infra--VMIsInfo | sed -E 's|^(\S+)\s+(\S+).+|-n "\1" "\2"|'
}
```
</details>


# Functions
## Shell Access
<details><summary>VMI</summary>

```shell
function olp--virt--infr--VMI--con () {
    typeset pFwd="${1:-${OLP__VIRT__SSH__PORT:-1:22}}"; (($#)) && shift
    typeset usrName="${1:-${OLP__VIRT__SSH__USR}}"; (($#)) && shift
    typeset -a vmiIDs="${1:-$(_olp--virt--infra--GetVMIs)}"; (($#)) && shift;

    typeset e=
    typeset -i lPort="${pFwd%%:*}" rPort="${pFwd##*:}"

    vmiIDs[0]="$(echo "${vmiIDs[0]}" | sed -E 's|" "|" "vmi/|g')"
    IFS=$'\n' read -d '' -ra vmiIDs <<<"${vmiIDs[0]}"

    if ((rPort)); then
        if ((lPort)); then
            typeset vctlPortFwdOpts="${1:-${OLP__VIRT__VCTL_PORTFWD_OPTS:-()}}"; (($#)) && shift
            typeset sshOpts="${1:-${K8S__SSH__OPTS:-()}}"; (($#)) && shift

            typeset -a vctlPortFwdOpts="${vctlPortFwdOpts}"
            typeset -a sshOpts="${sshOpts}"

            usrName="${usrName:+${usrName@Q}}"

            for e in "${vmiIDs[@]}"; do
                eval "
                    ssh -t -p ${rPort} \
                        -o LogLevel=ERROR \
                        -o UserKnownHostsFile=/dev/null \
                        -o StrictHostKeyChecking=no \
                        ${K8S__SSH__ID:+-i ${K8S__SSH__ID@Q}} \
                        -o \"\$(
echo 'ProxyCommand=virtctl port-forward --stdio=true ${e} \"%p\"'\
    \"\${vctlPortFwdOpts[@]@Q}\" \
                        )\" \
                        ${usrName:+-o User=${usrName@Q}} \
                        ${sshOpts[@]@Q} \
                        "$(
                            echo "${e}" |
                            sed -E 's|^-n "([^"]+)" "([^"]+)"|\2.\1|'
                        )" "${@@Q}"
                "
            done
        else
            typeset vctlSshOpts="${1:-${OLP__VIRT__VCTL_SSH_OPTS:-()}}"; (($#)) && shift
            typeset sshOpts="${1:-${K8S__SSH__OPTS:-()}}"; (($#)) && shift

            typeset -a vctlSshOpts="${vctlSshOpts}"
            typeset -a sshOpts="${sshOpts}"

            [ -n "${usrName}" ] && vctlSshOpts+=(-l "${usrName}")
            (($#)) && vctlSshOpts+=(-c "${1}")

            for e in "${vmiIDs[@]}"; do
                eval "
                    virtctl ssh -p "${rPort}" \
                        ${K8S__SSH__ID:+-i ${K8S__SSH__ID@Q}} \
                        -t '-t' \
                        -t '-o LogLevel=ERROR' \
                        -t '-o UserKnownHostsFile=/dev/null' \
                        -t '-o StrictHostKeyChecking=no' \
                        $(for e in "${sshOpts[@]}"; do echo -n "-t ${e@Q} "; done) \
                        ${e} ${vctlSshOpts[@]@Q}
                "
            done
        fi
    else
        typeset vctlConOpts="${1:-${OLP__VIRT__VCTL_CON_OPTS:-()}}"; (($#)) && shift

        typeset -a vctlConOpts="${vctlConOpts}"

        for e in "${vmiIDs[@]}"; do
            eval "virtctl console ${e/\" \"vmi\//\" \"} ${vctlConOpts[@]@Q}"
        done
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
    typeset pFwd="${1:-${OLP__VIRT__SCP__PORT:-1:22}}"; (($#)) && shift
    typeset usrName="${1:-${OLP__VIRT__SSH__USR}}"; (($#)) && shift
    typeset -a vmiIDs="${1:-$(_olp--virt--infra--GetVMIs)}"; (($#)) && shift;
    typeset vctlPortFwdOpts="${1:-${OLP__VIRT__VCTL_PORTFWD_OPTS:-()}}"; (($#)) && shift
    typeset scpOpts="${1:-${K8S__SCP_OPTS:-()}}"; (($#)) && shift

    typeset e= v= tP=
    typeset -i i=0
    typeset -i lPort="${pFwd%%:*}" rPort="${pFwd##*:}"
    typeset -a sPaths="${sPaths}" sPs=()
    typeset -a vctlPortFwdOpts="${vctlPortFwdOpts}"
    typeset -a scpOpts="${scpOpts}"

    usrName="${usrName:+${usrName@Q}}"
    vmiIDs[0]="$(echo "${vmiIDs[0]}" | sed -E 's|" "|" "vmi/|g')"
    IFS=$'\n' read -d '' -ra vmiIDs <<<"${vmiIDs[0]}"

    for e in "${vmiIDs[@]}"; do
        v="$(echo "${e}" | sed -E 's|^-n "([^"]+)" "vmi/([^"]+)"|\2.\1|')"
        sPs=("${sPaths[@]}")
        for i in "${!sPs[@]}"; do
            [ "${sPs[${i}]:0:1}" = ':' ] &&
            sPs[${i}]="${v}${sPs[${i}]}"
        done
        [ "${tPath:0:1}" = ':' ] && tP="${v}${tPath}" || tP="${tPath}"

        eval "
            scp -P ${rPort} \
                -o LogLevel=ERROR \
                -o UserKnownHostsFile=/dev/null \
                -o StrictHostKeyChecking=no \
                ${K8S__SSH__ID:+-i ${K8S__SSH__ID@Q}} \
                -o \"\$(
echo 'ProxyCommand=virtctl port-forward --stdio=true ${e} \"%p\"'\
    \"\${vctlPortFwdOpts[@]@Q}\" \
                )\" \
                ${usrName:+-o User=${usrName@Q}} \
                ${sshOpts[@]@Q} \
                ${sPs[@]@Q} ${tP@Q}
        "
    done
}
```
</details>

## TCP Port Fowarding
<details><summary>VMI</summary>

```shell
function olp--virt--infr--VMI--port-fwd () {
    typeset pFwd="${1:-${OLP__VIRT__SCP__PORT:-1:22}}"; (($#)) && shift
    typeset usrName="${1:-${OLP__VIRT__SSH__USR}}"; (($#)) && shift
    typeset -a vmiIDs="${1:-$(_olp--virt--infra--GetVMIs)}"; (($#)) && shift;
    typeset vctlPortFwdOpts="${1:-${OLP__VIRT__VCTL_PORTFWD_OPTS:-()}}"; (($#)) && shift
    typeset sshOpts="${1:-${K8S__SSH__OPTS:-()}}"; (($#)) && shift

    typeset e= v=
    typeset -i i=0
    typeset -i lPort="${pFwd%%:*}" rPort="${pFwd##*:}"
    typeset -a vctlPortFwdOpts="${vctlPortFwdOpts}"
    typeset -a sshOpts="${sshOpts}"
    typeset -ai fwdrPIDs=()

    ((lPort)) || lPort="$(__RandomFreePort 10000 10999)"
    usrName="${usrName:+${usrName@Q}}"
    vmiIDs[0]="$(echo "${vmiIDs[0]}" | sed -E 's|" "|" "vmi/|g')"
    IFS=$'\n' read -d '' -ra vmiIDs <<<"${vmiIDs[0]}"
    __ValidatePortFwds ${lPort} ${#vmiIDs[@]} ${rPort} || return 1

    (   # Silence the Job Control messages and allow `trap`.
        for e in "${vmiIDs[@]}"; do
            eval "
                virtctl port-forward ${e} ${lPort@Q}:${rPort@Q} \
                    ${vctlPortFwdOpts[@]@Q} & fwdrPIDs+=(\$!)
            "
            echo "TCP Local Port $((lPort++)) is forwarded to Remote Port ${rPort}."
        done
        trap 'kill ${fwdrPIDs[@]} 2> /dev/null; wait ${fwdrPIDs[@]}' EXIT
        wait ${fwdrPIDs[@]}
    )
}
```
</details>


# Operations
## Must Gather
<details><summary>Must Gather</summary>

```shell
oc adm must-gather --image=registry.redhat.io/container-native-virtualization/cnv-must-gather-rhel9:v4.18 -- /usr/bin/gather
```
</details>
