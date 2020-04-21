let checkerTmplUnmatch=require('../plugins/checker-tmpl-unmatch');
let src=`<div
class="cellex-boom-1v3-quanyi-wrap-outer<% if(item.columnIndexClass){%> <%=item.columnIndexClass%><%}%>"
style="<% if(item.style){%><%=item.style%><%}%>"
>
<a
  href="<%= item.url%>"
  class="cellex-boom-1v3-quanyi-wrap"
  data-bindkey="url"
  data-itemid="<%= item.itemId%>"
>
  <div class="boom-item-bd">
    <div class="boom-item-entryPicWrap">
      <img
        class="boom-item-entryPic"
        data-bindkey="pic"
        data-itemid="<%= item.itemId%>"
        data-src="<%= item.pic%>"
        data-size="226x160"
        data-rewrite="{size:'226x160'}"
      />
    </div>
    <% if(item.auctionTags && item.auctionTags.indexOf('limitedOffer') > -1){%>
    <div class="boom-item-tagWrap">
      <span class="boom-item-tag">限量</span>
    </div>
    <%}%>
  </div>
  <div class="boom-item-main">
    <span class="boom-item-title" data-bindkey="awardName" data-itemid="<%= item.itemId%>"
      ><%= item.awardName%></span
    >
  </div>
  <div class="boom-item-submain">
    <img
      class="boom-item-actionBg"
      src="https://img.alicdn.com/tfs/TB1e3AnAfb2gK0jSZK9XXaEgFXa-380-128.png"
      data-size="190x64"
      data-rewrite="{size:'190x64'}"
    />
    <div class="boom-item-yuanWrap">
      <span
        class="boom-item-text7153832881"
        data-bindkey="rightsFace"
        data-itemid="<%= item.itemId%>"
        ><%= item.rightsFace%></span
      >
      <span class="boom-item-yuan" data-bindkey="awardUnit" data-itemid="<%= item.itemId%>"
        ><%= item.awardUnit%></span
      >
    </div>
    <div class="boom-item-fullAvailableWrap">
      <span
        class="boom-item-fullAvailable"
        data-bindkey="awardTips"
        data-itemid="<%= item.itemId%>"
        ><%= item.awardTips%></span
      >
    </div>
  </div>
  <div class="boom-item-ft J_BK_click" data-clickname="cellex-bkvegas@0.0.1">
    <span class="boom-item-tag_2">立即领取</span>
  </div>
</a>
</div>`;

checkerTmplUnmatch(src);