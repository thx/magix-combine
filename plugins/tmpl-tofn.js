let configs = require('./util-config');
let escapeSlashRegExp = /\\|'/g;
let escapeBreakReturnRegExp = /\r|\n/g;
let mathcer = /<%([@=!])?([\s\S]*?)%>|$/g;
let viewIdReg = /\x1f/g;
let closeReg = /\);?\s*$/;
module.exports = (tmpl, file) => {
    // Compile the template source, escaping string literals appropriately.
    let index = 0;
    let source = `$p+='`;
    let hasAtRule = false;
    tmpl.replace(mathcer, (match, operate, content, offset) => {
        source += tmpl.substring(index, offset).replace(escapeSlashRegExp, `\\$&`).replace(escapeBreakReturnRegExp, `\\n`);
        index = offset + match.length;
        if (configs.debug) {
            let expr = tmpl.substring(index - match.length + 2 + (operate ? 1 : 0), index - 2);
            let artReg = /^'(\d+)\x11([^\x11]+)\x11'$/;
            let artM = expr.match(artReg);
            let art = '';
            let line = -1;
            if (artM) {
                expr = expr.replace(artReg, '');
                art = artM[2];
                line = artM[1];
            } else {
                expr = expr.replace(escapeSlashRegExp, `\\$&`).replace(escapeBreakReturnRegExp, `\\n`);
            }
            if (operate == `@`) {
                hasAtRule = true;
                source += `';$expr='<%` + operate + expr + `%>';$p+=$i(` + content + `);$p+='`;
            } else if (operate == `=`) {
                source += `'+($expr='<%` + operate + expr + `%>',$e(` + content + `))+'`;
            } else if (operate == `!`) {
                if (!content.startsWith('$eu(') || !content.endsWith(')')) {
                    content = `$n(${content})`;
                }
                source += `'+($expr='<%` + operate + expr + `%>',` + content + `)+'`;
            } else if (content) {
                if (line > -1) {
                    source += `';$line=` + line + `;$art='` + art + `';`;
                    content = '';
                } else {
                    source += `';`;
                }
                if (expr) {
                    source += `$expr='<%` + expr + `%>';`;
                }
                source += content + `;$p+='`;
            }
        } else {
            if (operate == `@`) {
                hasAtRule = true;
                source += `';$p+=$i(${content});$p+='`;
            } else if (operate == `=`) {
                source += `'+$e(${content})+'`;
            } else if (operate == `!`) {
                if (!content.startsWith('$eu(') || !content.endsWith(')')) {
                    content = `$n(${content})`;
                }
                source += `'+${content}+'`;
            } else if (content) {
                source += `';${content};$p+='`;
            }
        }
        // Adobe VMs need the match returned to produce the correct offset.
        return match;
    });
    source += `';`;

    if (configs.debug) {
        source = `let $expr,$art,$line;try{${source}}catch(ex){let msg='render view error:'+(ex.message||ex);if($art)msg+='\\r\\n\\tsrc art:{{'+$art+'}}\\r\\n\\tat line:'+$line;msg+='\\r\\n\\t'+($art?'translate to:':'expr:');msg+=$expr+'\\r\\n\\tat file:${file}';throw msg;}`;
    }
    source = source.replace(viewIdReg, `'+$viewId+'`);

    let atRule = hasAtRule ? `,$i=(v,k,f)=>{for(f=$$[$g];--f;)if($$[k=$g+f]===v)return k;$$[k=$g+$$[$g]++]=v;return k;}` : '';

    let encode = `,$em={'&':'amp','<':'lt','>':'gt','"':'#34','\\'':'#39','\`':'#96'},$er=/[&<>"'\`]/g,$n=v=>''+(v==null?'':v),$ef=m=>\`&\${$em[m]};\`,$e=v=>$n(v).replace($er,$ef)`;

    let encodeURIMore = `,$um={'!':'%21','\\'':'%27','(':'%28',')':'%29','*':'%2A'},$uf=m=>$um[m],$uq=/[!')(*]/g,$eu=v=>encodeURIComponent($n(v)).replace($uq,$uf)`;

    let encodeQuote = `,$qr=/[\\\\'\"]/g,$eq=v=>$n(v).replace($qr,'\\\\$&')`;

    source = `let $g='\x1e',$p=''${encode}${encodeURIMore}${encodeQuote}${atRule};${source}return $p`;

    source = configs.compileTmplCommand(`($$,$viewId)=>{${source}}`, configs);
    if (source.startsWith('(')) {
        source = source.substring(1).replace(closeReg, '');
    }
    return source;
};