import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { normalizePagePath, type AppConfigRule } from '../../config/appConfiguration';
import { useAppConfig } from '../../hooks/useAppConfig';

const EXCLUDED_PAGES = ['/settings/app-configuration'];

const IGNORED_SELECTOR = [
  'script', 'style', 'noscript', 'textarea', 'input', 'select', 'option',
  'code', 'pre', 'svg', '[contenteditable="true"]', '[data-config-ignore]',
].join(',');

function isIgnored(node: Node | null): boolean {
  const element = node instanceof Element
    ? node
    : node?.parentElement ?? null;
  if (!element) return true;
  return Boolean(element.closest(IGNORED_SELECTOR));
}

function textNodeValue(node: Text, replacement: string): string {
  const current = node.nodeValue ?? '';
  const leading = current.match(/^\s*/)?.[0] ?? '';
  const trailing = current.match(/\s*$/)?.[0] ?? '';
  return `${leading}${replacement}${trailing}`;
}

/**
 * Applies zero-code configuration rules to the live page:
 *
 * - selector rules hide/replace any DOM element on any page;
 * - text rules replace exact visible strings anywhere in the page scope.
 *
 * This is what lets the engine control sections and wording of pages that
 * were not individually instrumented, without rewriting 200+ screens.
 */
export const AppConfigRuntime: React.FC = () => {
  const location = useLocation();
  const state = useAppConfig();
  const pathname = normalizePagePath(location.pathname);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (EXCLUDED_PAGES.some((prefix) => pathname.startsWith(prefix))) return;

    const scope = document.querySelector<HTMLElement>('[data-app-config-scope]');
    if (!scope) return;

    const selectorRules = state.rules.filter((rule) =>
      rule.enabled
      && rule.kind === 'selector'
      && (rule.pagePath === '*' || normalizePagePath(rule.pagePath) === pathname)
    );
    const textRules = state.rules.filter((rule) =>
      rule.enabled
      && rule.kind === 'text'
      && (rule.pagePath === '*' || normalizePagePath(rule.pagePath) === pathname)
    );

    if (selectorRules.length === 0 && textRules.length === 0) return;

    const originalElements = new Map<HTMLElement, { display: string; priority: string; text: string | null }>();
    const originalTextNodes = new Map<Text, string>();

    const applySelectorRule = (rule: AppConfigRule) => {
      if (!rule.selector) return;
      let elements: NodeListOf<HTMLElement>;
      try {
        elements = scope.querySelectorAll<HTMLElement>(rule.selector);
      } catch {
        // Invalid selectors are rejected at save time, but old imports may
        // still contain one. Skip it instead of breaking the screen.
        return;
      }
      elements.forEach((element) => {
        if (element === scope) return;
        if (!originalElements.has(element)) {
          originalElements.set(element, {
            display: element.style.getPropertyValue('display'),
            priority: element.style.getPropertyPriority('display'),
            text: null,
          });
        }
        const original = originalElements.get(element)!;
        if (rule.action === 'hide') {
          element.style.setProperty('display', 'none', 'important');
          element.setAttribute('data-app-config-hidden', 'true');
        } else if (rule.action === 'show') {
          if (original.display) element.style.setProperty('display', original.display, original.priority);
          else element.style.removeProperty('display');
          element.removeAttribute('data-app-config-hidden');
        } else if (rule.action === 'text') {
          if (original.text === null) original.text = element.textContent ?? '';
          element.textContent = rule.replacementText ?? '';
        }
      });
    };

    const applyTextRules = () => {
      if (textRules.length === 0) return;
      const replacements = new Map<string, string>();
      for (const rule of textRules) {
        const source = (rule.matchText ?? '').trim();
        if (source) replacements.set(source, rule.replacementText ?? '');
      }
      if (replacements.size === 0) return;

      const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
          const value = (node.nodeValue ?? '').trim();
          if (!value) return NodeFilter.FILTER_REJECT;
          if (isIgnored(node.parentElement)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      let node = walker.nextNode();
      while (node) {
        const text = node as Text;
        const current = text.nodeValue ?? '';
        const trimmed = current.trim();
        const replacement = replacements.get(trimmed);
        if (replacement !== undefined && replacement !== trimmed) {
          if (!originalTextNodes.has(text)) originalTextNodes.set(text, current);
          text.nodeValue = textNodeValue(text, replacement);
        }
        node = walker.nextNode();
      }
    };

    const apply = () => {
      for (const rule of selectorRules) applySelectorRule(rule);
      applyTextRules();
    };

    apply();

    const observer = new MutationObserver(() => schedule());
    let scheduled = false;
    let timer: number | null = null;
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      timer = window.setTimeout(() => {
        scheduled = false;
        observer.disconnect();
        try {
          apply();
        } finally {
          observer.observe(scope, { childList: true, subtree: true, characterData: true });
        }
      }, 60);
    };
    observer.observe(scope, { childList: true, subtree: true, characterData: true });

    return () => {
      if (timer !== null) window.clearTimeout(timer);
      observer.disconnect();
      for (const [element, original] of originalElements) {
        if (original.display) element.style.setProperty('display', original.display, original.priority);
        else element.style.removeProperty('display');
        element.removeAttribute('data-app-config-hidden');
        if (original.text !== null) element.textContent = original.text;
      }
      for (const [node, value] of originalTextNodes) node.nodeValue = value;
    };
  }, [pathname, state]);

  return null;
};

export default AppConfigRuntime;
