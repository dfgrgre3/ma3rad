import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { normalizePagePath, type AppConfigRule } from '../../config/appConfiguration';
import { useAppConfig } from '../../hooks/config/useAppConfig';

const EXCLUDED_PAGES = ['/settings/app-configuration'];

const IGNORED_SELECTOR = [
  'script', 'style', 'noscript', 'textarea', 'input', 'select', 'option',
  'code', 'pre', 'svg', '[contenteditable="true"]', '[data-config-ignore]',
].join(',');

type ConfigurableElement = HTMLElement | SVGElement;

function isConfigurableElement(element: Element): element is ConfigurableElement {
  return element instanceof HTMLElement || element instanceof SVGElement;
}

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

    const originalElements = new Map<ConfigurableElement, { display: string; priority: string; text: string | null }>();
    const originalTextNodes = new Map<Text, string>();
    const lastAppliedText = new WeakMap<Text, string>();

    const textReplacements = new Map<string, string>();
    for (const rule of textRules) {
      const source = (rule.matchText ?? '').trim();
      if (source) textReplacements.set(source, rule.replacementText ?? '');
    }

    const applySelectorRuleToElement = (rule: AppConfigRule, element: ConfigurableElement) => {
      if (!rule.selector || element === scope) return;

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
        if (textReplacements.size > 0) scheduleTextRules(element);
      }
    };

    const applySelectorRules = (candidates?: Set<ConfigurableElement>) => {
      for (const rule of selectorRules) {
        if (!rule.selector) continue;
        if (candidates && !rule.selector.includes(':scope')) {
          candidates.forEach((element) => {
            try {
              if (element.matches(rule.selector!)) applySelectorRuleToElement(rule, element);
            } catch {
              // Invalid selectors are rejected at save time, but old imports may still contain one.
            }
          });
          continue;
        }

        let elements: NodeListOf<ConfigurableElement>;
        try {
          elements = scope.querySelectorAll<ConfigurableElement>(rule.selector);
        } catch {
          // Invalid selectors are rejected at save time, but old imports may
          // still contain one. Skip it instead of breaking the screen.
          continue;
        }
        elements.forEach((element) => applySelectorRuleToElement(rule, element));
      }
    };

    const applyTextNode = (text: Text) => {
      const current = text.nodeValue ?? '';
      if (lastAppliedText.get(text) === current) return;
      const trimmed = current.trim();
      if (!trimmed || isIgnored(text.parentElement)) return;
      const replacement = textReplacements.get(trimmed);
      if (replacement !== undefined && replacement !== trimmed) {
        if (!originalTextNodes.has(text)) originalTextNodes.set(text, current);
        text.nodeValue = textNodeValue(text, replacement);
        lastAppliedText.set(text, text.nodeValue ?? '');
      }
    };

    const pendingTextRoots: Node[] = [];
    let textWalker: TreeWalker | null = null;
    let textFrame: number | null = null;
    const createTextWalker = (root: Node) => document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
          if (!(node instanceof Text) || isIgnored(node.parentElement)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
    const processTextRoots = () => {
      textFrame = null;
      const deadline = performance.now() + 8;
      let processed = 0;
      while (processed < 300 && performance.now() < deadline) {
        if (!textWalker) {
          const root = pendingTextRoots.shift();
          if (!root) break;
          if (root.nodeType === Node.TEXT_NODE) {
            applyTextNode(root as Text);
            processed += 1;
            continue;
          }
          textWalker = createTextWalker(root);
        }

        const node = textWalker.nextNode();
        if (!node) {
          textWalker = null;
          continue;
        }
        applyTextNode(node as Text);
        processed += 1;
      }
      if (pendingTextRoots.length > 0 || textWalker) {
        textFrame = window.requestAnimationFrame(processTextRoots);
      }
    };
    const scheduleTextRules = (root: Node) => {
      if (pendingTextRoots.some((pending) =>
        pending === root || (pending instanceof Element && pending.contains(root))
      )) return;
      for (let index = pendingTextRoots.length - 1; index >= 0; index -= 1) {
        const pending = pendingTextRoots[index];
        if (root instanceof Element && root.contains(pending)) pendingTextRoots.splice(index, 1);
      }
      pendingTextRoots.push(root);
      if (textFrame === null) textFrame = window.requestAnimationFrame(processTextRoots);
    };

    const addElementSubtree = (root: Node, candidates: Set<ConfigurableElement>) => {
      if (root instanceof Element) {
        if (isConfigurableElement(root)) candidates.add(root);
        root.querySelectorAll<Element>('*').forEach((element) => {
          if (isConfigurableElement(element)) candidates.add(element);
        });
      }
    };

    // Revisit only added nodes, affected siblings, and ancestors after updates.
    const collectMutationCandidates = (records: MutationRecord[]) => {
      const candidates = new Set<ConfigurableElement>();
      const addAncestors = (element: Element | null) => {
        while (element && element !== scope) {
          if (isConfigurableElement(element)) candidates.add(element);
          element = element.parentElement;
        }
      };

      for (const record of records) {
        const target = record.target instanceof Element
          ? record.target
          : record.target.parentElement;
        addAncestors(target);
        if (record.type === 'childList' && target) {
          Array.from(target.children).forEach((element) => {
            if (isConfigurableElement(element)) candidates.add(element);
          });
          record.addedNodes.forEach((node) => addElementSubtree(node, candidates));
        }
      }
      return candidates;
    };

    applySelectorRules();
    if (textReplacements.size > 0) scheduleTextRules(scope);

    let pendingRecords: MutationRecord[] = [];
    const observer = new MutationObserver((records) => {
      pendingRecords = pendingRecords.concat(records);
      schedule();
    });
    let scheduled = false;
    let timer: number | null = null;
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      timer = window.setTimeout(() => {
        scheduled = false;
        pendingRecords = pendingRecords.concat(observer.takeRecords());
        const records = pendingRecords;
        pendingRecords = [];
        observer.disconnect();
        try {
          if (selectorRules.length > 0) applySelectorRules(collectMutationCandidates(records));
          if (textReplacements.size > 0) {
            for (const record of records) {
              if (record.type === 'characterData' && record.target instanceof Text) {
                lastAppliedText.delete(record.target);
                applyTextNode(record.target);
              } else if (record.type === 'childList') {
                record.addedNodes.forEach((node) => scheduleTextRules(node));
              }
            }
          }
        } finally {
          observer.observe(scope, { childList: true, subtree: true, characterData: true });
        }
      }, 60);
    };
    observer.observe(scope, { childList: true, subtree: true, characterData: true });

    return () => {
      if (timer !== null) window.clearTimeout(timer);
      if (textFrame !== null) window.cancelAnimationFrame(textFrame);
      observer.disconnect();
      pendingTextRoots.length = 0;
      textWalker = null;
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
