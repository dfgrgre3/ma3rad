import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronRight, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { User } from '../types';
import { PermissionService } from '../services/PermissionService';
import { NavigationService } from '../services/NavigationService';
import { useTheme } from '../contexts/ThemeContext';

interface SidebarProps {
  currentUser: User | null;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentUser }) => {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar_collapsed') === 'true');
  const { settings } = useTheme();

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('sidebar_open_groups');
      return saved ? JSON.parse(saved) : { dashboard: true, sales: true };
    } catch {
      return { dashboard: true, sales: true };
    }
  });

  const visibleGroups = useMemo(
    () =>
      NavigationService.getGroups()
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => !item.perm || PermissionService.can(currentUser, item.perm)),
        }))
        .filter((group) => group.items.length > 0),
    [currentUser, settings]
  );

  useEffect(() => {
    visibleGroups.forEach((group) => {
      const isActive = group.items.some(
        (item) => location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to + '/'))
      );
      if (isActive) setOpenGroups((prev) => ({ ...prev, [group.id]: true }));
    });
  }, [location.pathname, visibleGroups]);

  const toggleCollapsed = () => {
    setCollapsed((value) => {
      const next = !value;
      localStorage.setItem('sidebar_collapsed', String(next));
      return next;
    });
  };

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      localStorage.setItem('sidebar_open_groups', JSON.stringify(next));
      return next;
    });
  };

  return (
    <aside
      className={`${collapsed ? 'w-[76px]' : 'w-64'} bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100 flex flex-col h-full border-l border-slate-200 dark:border-slate-700 select-none shrink-0 transition-[width] duration-200`}
      dir="rtl"
    >
      <div className="px-4 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shadow-lg text-white font-black text-lg shrink-0 overflow-hidden"
          style={{ background: 'linear-gradient(to top right, var(--brand-primary, #0284c7), var(--brand-accent, #4f46e5))' }}
        >
          {settings.brandLogoDataUrl ? (
            <img src={settings.brandLogoDataUrl} alt="logo" className="w-full h-full object-cover" />
          ) : (
            (settings.brandShortName || 'C').slice(0, 2)
          )}
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <h1 className="font-extrabold text-sm text-slate-900 dark:text-slate-100 tracking-wide truncate">
              {settings.brandName || 'CeramiSys ERP'}
            </h1>
            <p className="text-[10px] text-sky-600 dark:text-sky-400 font-medium truncate">
              {settings.showroomName || 'نظام معارض السيراميك المتكامل'}
            </p>
          </div>
        )}
      </div>

      <button
        onClick={toggleCollapsed}
        className="mx-3 mt-3 flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-600 p-2 text-slate-500 dark:text-slate-300 transition hover:bg-slate-100 dark:hover:bg-slate-800"
        title={collapsed ? 'توسيع القائمة' : 'طي القائمة'}
        aria-label={collapsed ? 'توسيع القائمة' : 'طي القائمة'}
      >
        {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
      </button>

      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5 scrollbar-thin">
        {visibleGroups.map((group) => {
          const GroupIcon = group.icon;
          const isOpen = openGroups[group.id] ?? false;
          const isGroupActive = group.items.some(
            (item) => location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to + '/'))
          );

          if (group.items.length === 1) {
            const item = group.items[0];
            const ItemIcon = item.icon;
            return (
              <NavLink
                key={group.id}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all duration-150 ${
                    isActive
                      ? 'bg-sky-600 text-white shadow-md shadow-sky-600/25'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
                  }`
                }
              >
                <ItemIcon className="w-4 h-4 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </NavLink>
            );
          }

          return (
            <div key={group.id}>
              <button
                onClick={() => toggleGroup(group.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-150 ${
                  isGroupActive
                    ? `${group.color} bg-slate-100 dark:bg-slate-800`
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
              >
                <GroupIcon className={`w-3.5 h-3.5 shrink-0 ${isGroupActive ? group.color : ''}`} />
                {!collapsed && <span className="flex-1 text-right">{group.label}</span>}
                {isOpen ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
              </button>

              {isOpen && (
                <div className="mt-0.5 mr-2 space-y-0.5 border-r border-slate-300/50 dark:border-slate-600/50 pr-1">
                  {group.items.map((item) => {
                    const ItemIcon = item.icon;
                    return (
                      <NavLink
                        key={item.to + item.label}
                        to={item.to}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 ${
                            isActive
                              ? 'bg-sky-600 text-white font-semibold shadow-sm shadow-sky-600/20'
                              : item.highlight
                                ? 'text-emerald-700 hover:bg-emerald-500/10 font-semibold dark:text-emerald-400'
                                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 font-medium dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
                          }`
                        }
                      >
                        <ItemIcon className="w-4 h-4 shrink-0" />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                        {item.badge && item.badge > 0 && (
                          <span className="mr-auto bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                            {item.badge > 99 ? '99+' : item.badge}
                          </span>
                        )}
                      </NavLink>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="p-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>SQLite — متصل</span>
          </div>
          {!collapsed && (
            <span className="text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono text-slate-500 dark:text-slate-400">
              v2.0.0
            </span>
          )}
        </div>
      </div>
    </aside>
  );
};
