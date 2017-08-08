let tp = require('../plugins/tmpl-parser');
let hm = require('html-minifier');
let input = hm.minify(`<form mx-view="app/gallery/mx-validation/index" id="form_">
    <div class="form-line clearfix">
        <label class="line-label">
            <i class="line-required">*</i> 必填校验：
        </label>
        <div class="fl">
            <input class="input" type="text" validator-required="true" />
            <span class="ml10 ib">同步测试：</span>
        </div>
    </div>
    <div class="form-line clearfix">
        <label class="line-label">
            Taginput：
        </label>
        <div class="fl">
            <div class="input"
                mx-view="app/gallery/mx-taginput/index"
                view-list=""
                view-placeholder="请选择分类"
                view-text-key="text"
                view-value-key="id"
                validator-required="true"
                mx-change="showSelected()"

            ></div>
        </div>
    </div>
    <div class="form-line clearfix">
        <label class="line-label">
            下拉框：
        </label>
        <div class="fl">
            <div mx-view="app/gallery/mx-dropdown/index"
                view-empty-text="下拉框"
                view-width="340"
                mx-change="showValue()"
                validator-required="true"
                >
                <item value="a1">text 1</item>
            </div>
        </div>
    </div>
    <div class="form-line clearfix">
        <label class="line-label">
            日历：
        </label>
        <div class="fl">
            <input class="input" type="text" validator-required="true" mx-view="app/gallery/mx-calendar/datepicker"  />
        </div>
    </div>
    <div class="form-line clearfix">
        <label class="line-label">
            颜色：
        </label>
        <div class="fl">
            <input class="input" type="text" validator-required="true" mx-view="app/gallery/mx-colorpicker/picker"  />
        </div>
        <div class="fl ml5 ib" style="cursor: help;" mx-view="app/gallery/mx-popover/index"
    view-content="提示内容提示内容提示内容提示内容提示内容提示内容提示内容提示内容提示内容提示内容提示内容提示内容提示内容提示内容提示内容提示内容">?</div>
    </div>
    <div class="form-line clearfix">
        <label class="line-label">
            范围：
        </label>
        <div class="fl">
            <div mx-view="app/gallery/mx-range/index" view-value="" mx-change="syncAge()" class="ib"></div>
            <div class="ib ml10"></div>
        </div>
    </div>
    <div class="form-line clearfix">
        <label class="line-label">
            上传：
        </label>
        <div class="fl">
            <a href="javascript:;"
                class="btn btn-brand"
                mx-view="app/gallery/mx-uploader/index"
                view-action="unfound/path">上传文件</a>
        </div>
    </div>
    <div class="form-line clearfix">
        <label class="line-label">
            备注：
        </label>
        <div class="fl">
            <textarea class="textarea" rows="4"></textarea>
        </div>
    </div>
</form>
`, {
  removeComments: true, //注释
  collapseWhitespace: true, //空白
  quoteCharacter: '"',
  removeEmptyAttributes: true,
  collapseInlineTagWhitespace: true,
  caseSensitive: true,
  removeAttributeQuotes: true,
  removeRedundantAttributes: true,
  sortClassName: true
});
let tokens = tp(input);

` abc=dev class="mb5 mt5 clearfix"  ::class=filter-item checked def`.replace(/([\w-:]+)(?:=(?:(["'])(.*?)\2|(\S*)))?/g, (m, key, q, value, value1) => {
  console.log(key, '=', value || value1);
});

console.log(input, JSON.stringify(tokens));