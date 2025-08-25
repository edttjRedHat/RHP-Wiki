# Operations
## Tips & Tricks
<details><summary>Retrieving Document</summary>

```shell
# Retrieving Document from Release Information.
(
    typeset docNameRgx='...'
    oc adm release info --contents | awk '
        BEGIN{p=0}
        (p && /^#/){p=0; print "---"}
        (!p && /^# '"${docNameRgx}"'$/){p=1; print; next}
        p{print}
    '
) | yq | oc apply -f -
```
</details>
