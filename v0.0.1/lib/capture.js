export function captureArticle() {
  const root = document.querySelector("#content_views, article, [itemprop='articleBody'], .article-content, .post-content");
  if (!root) return {title:document.title,html:"",source:location.href};
  const copy = root.cloneNode(true);
  copy.querySelectorAll("script,style,iframe,button,nav,form,.hide-preCode-box,.pre-numbering,.opt-box").forEach(n=>n.remove());
  for (const img of copy.querySelectorAll("img")) {
    const src = img.getAttribute("data-src") || img.getAttribute("data-original") || img.getAttribute("src");
    if (src) { try { img.setAttribute("src",new URL(src,location.href).href); } catch {} }
    img.removeAttribute("srcset");
  }
  for (const a of copy.querySelectorAll("a[href]")) { try { a.setAttribute("href",new URL(a.getAttribute("href"),location.href).href); } catch {} }
  return {title:(document.querySelector("#articleContentId, h1")?.textContent || document.title).trim(),html:copy.innerHTML,source:location.href};
}
