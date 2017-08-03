let tp = require('../plugins/tmpl-parser');
let input = `qerqe<h4>新建商品组</h4>
<div class="mb5 mt5 clearfix">
  <div class="filter-item">
    <span class="filter-name">商品组名称</span>
    <input class="input" type="text" value="" />
    <span class="product-line-rule">不超过50字</span>
  </div>
  <div class="filter-item">
    <span class="filter-name">商品组类型</span>
    <label class="product-radio-label"><input class="radio" type="radio" name="isShare"  />私有</label>
    <label class="product-radio-label1"><input class="radio" type="radio" name="isShare"  />公开</label>
  </div>
  <div class="indicator clearfix">
    <div class="indicator-box">
      <div class="indicator-title">
        指标列表
      </div>
      <div class="indicator-list">
        <div class="indicator-group">
          <div class="indicator-group-title">指标分类名称</div>
          <div class="indicator-item">
            <label><input class="checkbox" type="checkbox" value="" />指标名称</label>
            <label><input class="checkbox" type="checkbox" value="" />指标名称</label>
            <label><input class="checkbox" type="checkbox" value="" />指标名称</label>
            <label><input class="checkbox" type="checkbox" value="" />指标名称</label>
            <label><input class="checkbox" type="checkbox" value="" />指标名称</label>
            <label><input class="checkbox" type="checkbox" value="" />指标名称</label>
            <label><input class="checkbox" type="checkbox" value="" />指标名称</label>
            <label><input class="checkbox" type="checkbox" value="" />指标名称</label>
            <label><input class="checkbox" type="checkbox" value="" />指标名称</label>
          </div>
          <div class="indicator-group-title">指标分类名称</div>
          <div class="indicator-item">
            <label><input class="checkbox" type="checkbox" value="" />指标名称</label>
            <label><input class="checkbox" type="checkbox" value="" />指标名称</label>
            <label><input class="checkbox" type="checkbox" value="" />指标名称</label>
            <label><input class="checkbox" type="checkbox" value="" />指标名称</label>
          </div>
          <div class="indicator-item">
            <label><input class="checkbox" type="checkbox" value="" />指标名称</label>
            <label><input class="checkbox" type="checkbox" value="" />指标名称</label>
            <label><input class="checkbox" type="checkbox" value="" />指标名称</label>
            <label><input class="checkbox" type="checkbox" value="" />指标名称</label>
            <label><input class="checkbox" type="checkbox" value="" />指标名称</label>
            <label><input class="checkbox" type="checkbox" value="" />指标名称</label>
            <label><input class="checkbox" type="checkbox" value="" />指标名称</label>
            <label><input class="checkbox" type="checkbox" value="" />指标名称</label>
            <label><input class="checkbox" type="checkbox" value="" />指标名称</label>
          </div>
          <div class="indicator-group-title">指标分类名称</div>
          <div class="indicator-item">
            <label><input class="checkbox" type="checkbox" value="" />指标名称</label>
            <label><input class="checkbox" type="checkbox" value="" />指标名称</label>
            <label><input class="checkbox" type="checkbox" value="" />指标名称</label>
            <label><input class="checkbox" type="checkbox" value="" />指标名称</label>
          </div>
        </div>
      </div>
    </div>
    <span class="fl"></span>
    <div class="indicator-box">as</div>
  </div>
</div>
adfasd
`;
let tokens=tp(input);

console.log(input, JSON.stringify(tokens));