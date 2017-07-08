let attrObject = require('../plugins/tmpl-attr-object');
require('colors');
let expect = (source, result) => {
    if (source != result) {
        console.log('expect:', result.red, 'source:', source.red);
    } else {
        console.log('ok:', result.blue);
    }
};
let t_1 = `
    {a:'\\'\\\\'}
`;
let r_1 = attrObject.likeObject(t_1);
expect(r_1, ',"\u0017{a:\'\\&#x27;\\\\\'}"');

let t1 = `
    {a:b,c:'d'}
`;
let r1 = attrObject.likeObject(t1);
expect(r1, ',"\u0017{a:",b,"\u0017c:\'d\'}"');

let t2 = `
    {a:b,c:'d"\\''}
`;
let r2 = attrObject.likeObject(t2);
expect(r2, ',"\u0017{a:",b,"\u0017c:\'d&quot;\\&#x27;\'}"');

try {
    let t3 = `
        {a{:b,c:'d"\\''}
    `;
    attrObject.likeObject(t3);
    expect('no error', 'error');
} catch (ex) {
    expect(ex.message, 'bad key. Input:{a{:b,c:\'d"\\\'\'}');
}

try {
    let t4 = `
        {a:b{}
    `;
    attrObject.likeObject(t4);
    expect('no error', 'error');
} catch (ex) {
    expect(ex.message, 'bad value. Input:{a:b{}');
}

let t5 = `
    {a,b}
`;
let r5 = attrObject.likeObject(t5);
expect(r5, ',"\u0017{a:\'a\',b:\'b\'}"');

try {
    let t6 = `
        {a,b}}
    `;
    attrObject.likeObject(t6);
    expect('no error', 'error');
} catch (ex) {
    expect(ex.message, 'missing key. Input:{a,b}}');
}
try {
    let t7 = `
        {a,b,,}
    `;
    attrObject.likeObject(t7);
    expect('no error', 'error');
} catch (ex) {
    expect(ex.message, 'missing key. Input:{a,b,,}');
}

let t8 = `
    {a:'::'}
`;
let r8 = attrObject.likeObject(t8);
expect(r8, ',"\u0017{a:\'::\'}"');

try {
    let t9 = `
        {a:b:'c'}
    `;
    attrObject.likeObject(t9);
    expect('no error', 'error');
} catch (ex) {
    expect(ex.message, 'bad value. Input:{a:b:\'c\'}');
}

let t10 = `
    {a:"b\\\\\\"'"}
`;
let r10 = attrObject.likeObject(t10);
expect(r10, ',"\u0017{a:\'b\\\\\\&quot;\\&#x27;\'}"');


let t11 = `
    {a:"'",b:'"'}
`;
let r11 = attrObject.likeObject(t11);
expect(r11, ',"\u0017{a:\'\\&#x27;\',b:\'&quot;\'}"');