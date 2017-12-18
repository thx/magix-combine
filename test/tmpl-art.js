let art=require('../plugins/tmpl-art');

let source=`{{each list as index value}}
{{= index }}
<span>
{{! value }}</span>
{{/each}}

{{let a=20,b=30}}


{{each a as outer}}
    {{=outer}}
    {{each outer}}
        {{ =$value }}
    {{/each}}
{{/each}}
{{if key.a>20 }}


{{else if a && b  || c}}

{{/if}}

{{forin o as value key}}

    <span>{{! fn(value) }}<input {{:key}}/></span>
{{/forin}}

{{=fn(a,b,c)}}

{{ let a=20,b=30,c={} }}

{{ for(let p in a){ }}
    {{=p}}
{{ } }}
`;

console.log(art(source));