let cssParser = require('../plugins/css-parser');
require('colors');
let expect = (source, result) => {
    if (source != result) {
        console.log('expect:', result.red, 'source:', source.red);
    } else {
        console.log('ok:', result.blue);
    }
};

let t1 = `
#app{//tip

}
ul li{ //ok

}
ul li c{//ok

}
div div ul li{//tip

}
div+div ul li{//tip

}
.span a{//tip

}
a.span{//ok

}
a .span{//tip

}

ul:not(:first-child){//ok

}

ul:not("not .span") .b{//tip not and selector

}
.a .b{//ok

}
.a:hover .b{//ok

}
.a .b .c{//tip

}
a.b.c{//ok

}
a:hover.b.c{//ok

}
[mx-view]{//ok

}
[mx-view][view-text]{//ok

}
[mx-view][view-text][attr]{//ok

}
[mx-view][view-text][attr][prop]{//tip

}
a[mx-view] [view-text]{//ok

}

a[mx-view] [view-text] [attr] [prop]{//tip

}

#app a{

}
#app [attr]{

}

.table-striped tbody tr:nth-child(odd) td{//ok

}
.table tfoot td {//ok

}

@import url('a.css') //tip

@media screen and (-webkit-min-device-pixel-ratio: 0) {
  a .input {//tip
    line-height: normal !important;
  }
}

.ztree li span.button.chk.checkbox_false_part_focus{//tip

}
fieldset[disabled] .form-control{//tip

}
`;
// let t1=`
// a.span{//tip

// }
// `;
let c1 = cssParser(t1);
console.log(c1);
//return;
expect(c1.nests[0], '#app');
expect(c1.nests[1], 'div div ul li');
expect(c1.nests[2], 'div+div ul li');
expect(c1.nests[3], '.span a');
expect(c1.nests[4], 'a .span');
expect(c1.nests[5], 'not .span');
expect(c1.nests[6], 'ul:not("not .span") .b');
expect(c1.nests[7], '.a .b .c');
expect(c1.nests[8], '[mx-view][view-text][attr][prop]');
expect(c1.nests[9], 'a[mx-view] [view-text] [attr] [prop]');
expect(c1.nests[10], '#app a');
expect(c1.nests[11], '#app [attr]');
expect(c1.nests[12], '@import url(\'a.css\') //tip');
expect(c1.nests[13], 'a .input');
expect(c1.nests[14], '.ztree li span.button.chk.checkbox_false_part_focus');
expect(c1.nests[15], 'fieldset[disabled] .form-control');