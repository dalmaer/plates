import {describeRoute,lensRoute} from './navigation-routes.mjs';
// The theme toggle cycles system → light → dark. System is the absence of a
// choice: no data-theme and nothing stored. /assets/theme.mjs applies a stored
// choice before paint; this keeps the page, the label and the theme-color
// metas in step after a click.
export const THEMES=Object.freeze(['system','light','dark']);
export const THEME_KEY='plates-theme';
const LABELS={system:'System',light:'Light',dark:'Dark'};
export const nextTheme=theme=>THEMES[(THEMES.indexOf(theme)+1)%THEMES.length];
export function themeLabel(theme){return `Theme: ${LABELS[theme]}. Switch to ${LABELS[nextTheme(theme)]}`;}
export function readTheme(window){try{const value=window.localStorage.getItem(THEME_KEY);return value==='light'||value==='dark'?value:'system';}catch{return 'system';}}
function storeTheme(window,theme){try{if(theme==='system')window.localStorage.removeItem(THEME_KEY);else window.localStorage.setItem(THEME_KEY,theme);}catch{/* Not remembered on this device; the page still switches. */}}
export function startThemeToggle({document,window,button}) {
  if(!button||typeof button.addEventListener!=='function')return null;
  const root=document.documentElement;
  // Server colours per scheme, read before theme.mjs repaints them on DOMContentLoaded.
  const metas=[...(document.querySelectorAll?.('meta[name="theme-color"]')||[])].map(meta=>({meta,dark:/dark/.test(meta.getAttribute('media')||''),content:meta.getAttribute('content')}));
  let theme=readTheme(window);
  const show=()=>{button.textContent=LABELS[theme];button.setAttribute('aria-label',themeLabel(theme));button.dataset.themeState=theme;};
  const apply=()=>{
    if(theme==='system')root?.removeAttribute('data-theme');else root?.setAttribute('data-theme',theme);
    const chosen=theme==='system'?null:metas.find(entry=>entry.dark===(theme==='dark'))?.content;
    for(const entry of metas)entry.meta.setAttribute('content',chosen||entry.content);
    show();
  };
  const click=()=>{theme=nextTheme(theme);storeTheme(window,theme);apply();};
  show();
  button.addEventListener('click',click);
  return {get theme(){return theme;},stop(){button.removeEventListener('click',click);}};
}
export function startNavigation({document,window}) {
  const root=document.querySelector('[data-navigation]');
  if(!root)return null;
  function refresh() {
    const path=window.location.pathname+(window.location.search||'');
    const current=describeRoute(path);
    if(!current)return;
    for(const anchor of root.querySelectorAll('[data-project-lens]')) {
      const target=lensRoute(path,anchor.dataset.projectLens||null);
      anchor.href=target.path;
      const explanation=anchor.querySelector?.('[data-lens-explanation]');
      if(explanation)explanation.textContent=target.notice||'';
    }
    for(const anchor of root.querySelectorAll('[data-nav-destination]')) {
      if(anchor.dataset.navDestination===current.destination)anchor.setAttribute('aria-current','page');
      else anchor.removeAttribute('aria-current');
    }
    const notice=root.querySelector('[data-lens-notice]');
    if(notice)notice.textContent=current.detail?'This record stays with its original project. Switching opens the selected view index.':'Switch projects while keeping the current kind of view.';
  }
  refresh();
  root.addEventListener('toggle',refresh,true);
  window.addEventListener('popstate',refresh);
  return {refresh,stop(){root.removeEventListener('toggle',refresh,true);window.removeEventListener('popstate',refresh);}};
}
// The theme toggle lives in the page footer, outside the navigation header.
if(typeof window!=='undefined'&&typeof document!=='undefined'){startNavigation({document,window});startThemeToggle({document,window,button:document.querySelector('[data-page-footer] [data-theme-toggle]')});}
