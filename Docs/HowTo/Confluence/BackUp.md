# Back Up
<details><summary>Export / Import Confluence Page</summary>

```shell
(
    pageID=...pageID...
    WIKI_AUTH_CLOUD='...usr...:...token...'
    WIKI_TOKEN='...'
    WIKI_BASE_URL='https://spaces.redhat.com'
    WIKI_API_URL="${WIKI_BASE_URL}/rest/api/content/${pageID}"

    function dlPage () {
        curl -fsSL -H "Authorization: Bearer ${WIKI_TOKEN}" "${WIKI_API_URL}?expand=body.storage" |
        jq -r '.body.storage.value'
    }
    function ulPage () {
        typeset -a pageInfo=()
        IFS=$'\n' read -d '' -ra pageInfo 0< <(
            curl -fsSL -H "Authorization: Bearer ${WIKI_TOKEN}" "${WIKI_API_URL}" |
            jq -r '.title, .version.number'
        )
        curl -fsSL -X PUT \
            -H "Authorization: Bearer ${WIKI_TOKEN}" \
            -H 'Accept: application/json' \
            -H 'Content-Type: application/json' \
            -o /dev/null \
            --write-out 'HTTP Response Code: %{http_code}\n' \
            --data-binary @<(jq -Rsr . 0<<jsonEOF
{
    "id": "${pageID}",
    "type": "page",
    "title": "${pageInfo[0]}",
    "version": {
        "number": $((++pageInfo[1]))
    },
    "body": {
        "storage": {
            "value": $(jq -Rs .),
            "representation": "storage"
        }
    }
}
jsonEOF
        ) "${WIKI_API_URL}"
    }

    dlPage
#   ulPage
)
```
</details>


# Offsite Processing
<details><summary>Getting Macro Content</summary>

```shell
XPATH0='//ac:structured-macro[@ac:macro-id=\"${mID}\"]/ac:plain-text-body' \
    bash -c "$(cat - 0<<'cmdEOF'
        typeset inFile="${1}"; (($#)) && shift
        typeset mID="${1}"; (($#)) && shift
        typeset xPath0="$(eval "echo \"${XPATH0}\"")"

        xmlstarlet select -P \
            -t -m "${xPath0}" -c 'node()' \
            0< <(cat - 0<<htmlEOF
<!DOCTYPE html>
<html lang="en" \
    xmlns:ac="http://www.atlassian.com/schema/confluence/4/ac/" \
    xmlns:ri="http://www.atlassian.com/schema/confluence/4/ri/" \
>"
<body>
$(cat "${inFile}")
</body>
</html>
htmlEOF
        )
cmdEOF
    )" '' ...inFile... ...mID...
```
</details>
<details><summary>Preparing Macro Content</summary>

```shell
# Prettying HTML (will remove white-space after `anchor` kind elements!!!)
tidy -q -i -w 0 -xml ...inFile...
# Restoring it.
gawk '
    BEGIN{RS="<!\\[CDATA\\[|]]>"}
    {
        if (NR%2) {
            gsub(/\n\s*/,"")
            printf("%s",gensub(/(<\/a(c:link)?>)([^<;:,.!?])/,"\\1 \\3","g"))
        } else {
            printf("<![CDATA[%s]]>",$0)
        }
    }
    END{printf("\n")}
' ...inFile...
```
</details>
<details><summary>Updating Macro Content</summary>

```shell
XPATH0='//ac:structured-macro[@ac:macro-id=\"${mID}\"]/ac:plain-text-body' \
    bash -c "$(cat - 0<<'cmdEOF'
        typeset inFile="${1}"; (($#)) && shift
        typeset mID="${1}"; (($#)) && shift
        typeset mVal="${1}"; (($#)) && shift
        typeset xPath0="$(eval "echo \"${XPATH0}\"")"

        xmlstarlet edit -P -O \
            -u "${xPath0}" -v __CDATA__ \
            0< <(cat - 0<<htmlEOF
<!DOCTYPE html>
<html lang="en" \
    xmlns:ac="http://www.atlassian.com/schema/confluence/4/ac/" \
    xmlns:ri="http://www.atlassian.com/schema/confluence/4/ri/" \
>"
<body>
$(cat "${inFile}")
</body>
</html>
htmlEOF
        ) | sed 's|__CDATA__|<![CDATA['"$(
            printf '%q' "$(
                echo "${mVal}" | sed -E 's/\|/\|/g'
            )" | sed -E "s/^\\\$'//;s/&/\\\&/g;s/'$//"
        )"']]>|' | tail -n +4 | head -n -2
cmdEOF
    )" '' ...inFile... ...mID... ...mVal...
```
</details>
