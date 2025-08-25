# References
<details><summary>Machine Config Operator</summary>

[MCO](https://github.com/openshift/machine-config-operator)
</details>


# Operations
## Tips & Tricks
<details><summary>Health Check</summary>

```shell
# Check MCP states.
(
    for e in {master,worker}; do
        oc get MachineConfigPool "${e}" -o=jsonpath='{.status.configuration.name}{"\n"}'
        oc get Nodes -l "machineconfiguration.openshift.io/role=${e}" -o=jsonpath="$(cat - 0<<'ocEOF'
{range .items[*]}
    {.metadata.name}{"\t"}
    {.metadata.annotations.machineconfiguration\.openshift\.io/current-config}{"\n"}
{end}
ocEOF
        )"
    done
)
oc get Pods -n openshift-machine-config-operator
oc logs -n openshift-machine-config-operator --timestamps=true -l k8s-app=machine-config-controller
oc get CustomResourceDefinitions machineosconfigs.machineconfiguration.openshift.io
```
</details>
<details><summary>Restore Missing CRD from Cluster Release Information</summary>

 1. Find out the name of the CRD Document.
    ```shell
    # Get CRD Document.
    oc adm release info --contents | grep '...crdName...'
    ```
 2. Follow [Retrieving Document from Release Information](./Cluster--ReleaseInformation.md#tips-tricks).
</details>
