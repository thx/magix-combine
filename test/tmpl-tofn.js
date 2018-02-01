let tofn = require('../plugins/tmpl-tofn');

let source = `
<%for(let i=0;i<10;i++){%>
    <div <%if(i==5){%> id="abc"<%}%>></div>
<%}%>
`;

console.log(tofn(source,'a/to/b'));
