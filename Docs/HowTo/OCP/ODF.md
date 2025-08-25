# Accessing Ceph Tool
<details><summary>Using Cluster</summary>

```shell
(
    for e in $(
        oc get nodes -l node-role.kubernetes.io/worker='' -o jsonpath='{.items[*].metadata.name}'
    ); do
        ctrID="$(
            oc debug "node/${e}" -- chroot /host/ bash -c "$(cat - 0<<'lclEOF'
                crictl ps --name rook-ceph-tools -o json | jq -r '.containers[] | .id'
lclEOF
            )"
        )"
        [ -n "${ctrID}" ] && {
            oc debug "node/${e}" -- chroot /host/ bash -c "$(
            cat - 0<<lclEOF
                typeset ctrID="${ctrID}"
lclEOF
            cat - 0<<'lclEOF'
                crictl exec "${ctrID}" ceph status
lclEOF
            )"
            break
        }
    done
); echo $?
```
</details>
<details><summary>Direct connection (when Cluster API Server is not available)</summary>

```shell
(
    _NODE_USR_NAME='...'
    _NODE_HOSTS="$(echo '...')"
    for e in ${_NODE_HOSTS}; do
        ctrID="$(
            issh "${_NODE_USR_NAME}@${e}" "$(cat - 0<<'lclEOF'
                sudo crictl ps --name rook-ceph-tools -o json | jq -r '.containers[] | .id'
lclEOF
            )"
        )"
        [ -n "${ctrID}" ] && {
            issh "${_NODE_USR_NAME}@${e}" "$(
            cat - 0<<lclEOF
                typeset ctrID="${ctrID}"
lclEOF
            cat - 0<<'lclEOF'
                sudo bash -c "$(cat - 0<<rmtEOF
                    crictl exec "${ctrID}" ceph status
rmtEOF
                )"
lclEOF
            )"
            break
        }
    done
); echo $?
```
</details>


# Operations
## Must Gather
<details><summary>Must Gather</summary>

```shell
oc adm must-gather --image=registry.redhat.io/odf4/odf-must-gather-rhel9:v4.18 --dest-dir=<directory-name>
```
</details>
