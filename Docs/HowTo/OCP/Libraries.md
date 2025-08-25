# Libraries
## Generic
<details><summary>Find Free TCP Port</summary>

```shell
function __RelPhyPath () {
    typeset src="${1}"; (($#)) && shift
    typeset tgt="${1}"; (($#)) && shift

    typeset rPath=
    typeset -i i=0 j=0
    typeset -a sPaths=() tPaths=()

    IFS=/ read -d '' -ra sPaths 0< <(printf '%s\0' "$(
        CDPATH= \command cd -L "${src}" 2> /dev/null
        \command pwd -P
    )")
    IFS=/ read -d '' -ra tPaths 0< <(printf '%s\0' "$(
        CDPATH= \command cd -L "${tgt}" 2> /dev/null
        \command pwd -P
    )")

    while (((i < ${#sPaths[@]}) && (i < ${#tPaths[@]}))); do
        [ "${sPaths[${i}]}" = "${tPaths[${i}]}" ] || break
        ((i++))
    done
    j=$((${#sPaths[@]} - i))
    while ((j--)); do rPath+='../'; done
    rPath+="$(IFS=/; echo "${tPaths[*]:i}")"

    echo "${rPath}"
}

function __RandomFreePort () {
    typeset -i min="${1}"; (($#)) && shift
    typeset -i max="${1}"; (($#)) && shift

    typeset -i tot=$((max - min + 1)) port=0

    while read -r port; do
        ((port)) && nc -zw 1 localhost ${port} 2> /dev/null || break
    done 0< <(shuf -i ${min}-${max} -n ${tot}; echo 0)

    echo ${port}
}
```
</details>
<details><summary>Get Relative Path from A Directory</summary>

```shell
function __RelPath () {
    typeset src="${1}"; (($#)) && shift
    typeset tgt="${1}"; (($#)) && shift

    typeset rPath=
    typeset -i i=0 j=0
    typeset -a sPaths=() tPaths=()

    IFS=/ read -d '' -ra sPaths 0< <(printf '%s\0' "${src}")
    IFS=/ read -d '' -ra tPaths 0< <(printf '%s\0' "${tgt}")

    while (((i < ${#sPaths[@]}) && (i < ${#tPaths[@]}))); do
        [ "${sPaths[${i}]}" = "${tPaths[${i}]}" ] || break
        ((i++))
    done
    j=$((${#sPaths[@]} - i))
    while ((j--)); do rPath+='../'; done
    rPath+="$(IFS=/; echo "${tPaths[*]:i}")"

    echo "${rPath}"
}
```
</details>
