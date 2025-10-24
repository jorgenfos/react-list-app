import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

const STORAGE_KEY = 'reactListAppState';
const APP_VERSION = '1.1.0';

const initialState = {
  lists: [],
  activeListId: null,
  appVersion: APP_VERSION
};

const AppStateContext = createContext(null);

function generateId() {
  return (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random()}`;
}

const SORT_OPTIONS = [
  { value: 'recent', label: 'Recently added' },
  { value: 'alpha', label: 'A–Z' },
  { value: 'tag', label: 'Tag' },
  { value: 'done-last', label: 'Done last' }
];

function AppStateProvider({ children }) {
  const [state, setState] = useState(initialState);
  const [searchText, setSearchText] = useState('');
  const [activeTagFilters, setActiveTagFilters] = useState([]);
  const [sortOption, setSortOption] = useState('recent');
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState(() => new Set());

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.lists && Array.isArray(parsed.lists)) {
          setState({
            ...parsed,
            appVersion: parsed.appVersion || APP_VERSION
          });
        }
      }
    } catch (error) {
      console.error('Failed to load state:', error);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('Failed to save state:', error);
    }
  }, [state]);

  const resetSelections = () => {
    setBulkSelectMode(false);
    setSelectedItemIds(new Set());
  };

  const actions = {
    addList: (name) => {
      const newList = {
        id: generateId(),
        name: name || 'New List',
        items: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      setState(prev => ({
        ...prev,
        lists: [...prev.lists, newList],
        activeListId: newList.id
      }));
      setSearchText('');
      setActiveTagFilters([]);
      resetSelections();
    },
    updateList: (listId, updates) => {
      setState(prev => ({
        ...prev,
        lists: prev.lists.map(list =>
          list.id === listId
            ? { ...list, ...updates, updatedAt: Date.now() }
            : list
        )
      }));
    },
    deleteList: (listId) => {
      setState(prev => {
        const lists = prev.lists.filter(list => list.id !== listId);
        const activeListId = prev.activeListId === listId
          ? (lists[0]?.id ?? null)
          : prev.activeListId;
        return {
          ...prev,
          lists,
          activeListId
        };
      });
      setSearchText('');
      setActiveTagFilters([]);
      resetSelections();
    },
    setActiveList: (listId) => {
      setState(prev => ({ ...prev, activeListId: listId }));
      setSearchText('');
      setActiveTagFilters([]);
      resetSelections();
    },
    addItem: (title, note, tags) => {
      if (!state.activeListId || !title.trim()) return;
      const newItem = {
        id: generateId(),
        title: title.trim(),
        note: note?.trim() || undefined,
        tags: tags ? tags.split(',').map(tag => tag.trim()).filter(Boolean) : [],
        done: false,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      setState(prev => ({
        ...prev,
        lists: prev.lists.map(list =>
          list.id === state.activeListId
            ? {
                ...list,
                items: [...list.items, newItem],
                updatedAt: Date.now()
              }
            : list
        )
      }));
    },
    updateItem: (itemId, updates) => {
      setState(prev => ({
        ...prev,
        lists: prev.lists.map(list =>
          list.id === state.activeListId
            ? {
                ...list,
                items: list.items.map(item =>
                  item.id === itemId
                    ? { ...item, ...updates, updatedAt: Date.now() }
                    : item
                ),
                updatedAt: Date.now()
              }
            : list
        )
      }));
    },
    duplicateItem: (itemId) => {
      setState(prev => ({
        ...prev,
        lists: prev.lists.map(list => {
          if (list.id !== state.activeListId) return list;
          const item = list.items.find(i => i.id === itemId);
          if (!item) return list;
          const clone = {
            ...item,
            id: generateId(),
            title: `${item.title} (copy)`,
            createdAt: Date.now(),
            updatedAt: Date.now()
          };
          return {
            ...list,
            items: [...list.items, clone],
            updatedAt: Date.now()
          };
        })
      }));
    },
    deleteItem: (itemId) => {
      setState(prev => ({
        ...prev,
        lists: prev.lists.map(list =>
          list.id === state.activeListId
            ? {
                ...list,
                items: list.items.filter(item => item.id !== itemId),
                updatedAt: Date.now()
              }
            : list
        )
      }));
      setSelectedItemIds(prev => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    },
    bulkMarkDone: (itemIds, done) => {
      setState(prev => ({
        ...prev,
        lists: prev.lists.map(list =>
          list.id === state.activeListId
            ? {
                ...list,
                items: list.items.map(item =>
                  itemIds.includes(item.id)
                    ? { ...item, done, updatedAt: Date.now() }
                    : item
                ),
                updatedAt: Date.now()
              }
            : list
        )
      }));
    },
    bulkDeleteItems: (itemIds) => {
      setState(prev => ({
        ...prev,
        lists: prev.lists.map(list =>
          list.id === state.activeListId
            ? {
                ...list,
                items: list.items.filter(item => !itemIds.includes(item.id)),
                updatedAt: Date.now()
              }
            : list
        )
      }));
      resetSelections();
    },
    moveItems: (itemIds, targetListId) => {
      if (!targetListId) return;
      setState(prev => {
        const sourceIndex = prev.lists.findIndex(list => list.id === prev.activeListId);
        const targetIndex = prev.lists.findIndex(list => list.id === targetListId);
        if (sourceIndex === -1 || targetIndex === -1) {
          return prev;
        }
        const sourceList = prev.lists[sourceIndex];
        const movingItems = sourceList.items.filter(item => itemIds.includes(item.id));
        if (movingItems.length === 0) return prev;
        const updatedSource = {
          ...sourceList,
          items: sourceList.items.filter(item => !itemIds.includes(item.id)),
          updatedAt: Date.now()
        };
        const targetList = prev.lists[targetIndex];
        const updatedTarget = {
          ...targetList,
          items: [...targetList.items, ...movingItems.map(item => ({
            ...item,
            id: generateId(),
            createdAt: Date.now(),
            updatedAt: Date.now()
          }))],
          updatedAt: Date.now()
        };
        const lists = prev.lists.map((list, index) => {
          if (index === sourceIndex) return updatedSource;
          if (index === targetIndex) return updatedTarget;
          return list;
        });
        return {
          ...prev,
          lists
        };
      });
      resetSelections();
    },
    importState: (importedState) => {
      if (!importedState.lists || !Array.isArray(importedState.lists)) {
        throw new Error('Invalid format: missing or invalid lists array');
      }
      importedState.lists.forEach(list => {
        if (!list.id || !list.name || !Array.isArray(list.items)) {
          throw new Error('Invalid format: malformed list data');
        }
      });
      setState({
        ...importedState,
        appVersion: importedState.appVersion || APP_VERSION
      });
      setSearchText('');
      setActiveTagFilters([]);
      resetSelections();
    },
    clearStorage: () => {
      localStorage.removeItem(STORAGE_KEY);
      setState(initialState);
      setSearchText('');
      setActiveTagFilters([]);
      resetSelections();
    }
  };

  const getActiveList = () => state.lists.find(list => list.id === state.activeListId);

  const availableTags = useMemo(() => {
    const activeList = getActiveList();
    if (!activeList) return [];
    const tagSet = new Set();
    activeList.items.forEach(item => {
      item.tags?.forEach(tag => tagSet.add(tag));
    });
    return Array.from(tagSet).sort((a, b) => a.localeCompare(b));
  }, [state.activeListId, state.lists]);

  const getFilteredItems = () => {
    const activeList = getActiveList();
    if (!activeList) return [];
    const query = searchText.trim().toLowerCase();
    const isTagQuery = query.startsWith('#');
    const queryTerm = isTagQuery ? query.slice(1) : query;
    let items = [...activeList.items];

    if (queryTerm) {
      items = items.filter(item => {
        const titleMatch = item.title.toLowerCase().includes(queryTerm);
        const noteMatch = item.note?.toLowerCase().includes(queryTerm);
        const tagMatch = item.tags?.some(tag => tag.toLowerCase().includes(queryTerm));
        if (isTagQuery) {
          return tagMatch;
        }
        return titleMatch || noteMatch || tagMatch;
      });
    }

    if (activeTagFilters.length > 0) {
      items = items.filter(item => item.tags?.some(tag => activeTagFilters.includes(tag)));
    }

    switch (sortOption) {
      case 'alpha':
        items.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'tag':
        items.sort((a, b) => {
          const aTag = a.tags?.[0] || '';
          const bTag = b.tags?.[0] || '';
          return aTag.localeCompare(bTag);
        });
        break;
      case 'done-last':
        items.sort((a, b) => {
          if (a.done === b.done) {
            return b.updatedAt - a.updatedAt;
          }
          return a.done ? 1 : -1;
        });
        break;
      case 'recent':
      default:
        items.sort((a, b) => b.createdAt - a.createdAt);
        break;
    }

    return items;
  };

  const toggleTagFilter = (tag) => {
    setActiveTagFilters(prev => {
      if (prev.includes(tag)) {
        return prev.filter(t => t !== tag);
      }
      return [...prev, tag];
    });
  };

  const toggleBulkSelectMode = () => {
    setBulkSelectMode(prev => {
      if (prev) {
        setSelectedItemIds(new Set());
      }
      return !prev;
    });
  };

  const toggleItemSelection = (itemId) => {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const value = {
    state,
    actions,
    searchText,
    setSearchText,
    activeTagFilters,
    toggleTagFilter,
    clearTagFilters: () => setActiveTagFilters([]),
    sortOption,
    setSortOption,
    bulkSelectMode,
    toggleBulkSelectMode,
    selectedItemIds,
    toggleItemSelection,
    clearSelection: resetSelections,
    availableTags,
    getActiveList,
    getFilteredItems
  };

  return (
    <AppStateContext.Provider value={value}>
      {children}
    </AppStateContext.Provider>
  );
}

function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error('useAppState must be used within AppStateProvider');
  }
  return context;
}

const SidebarListItem = React.forwardRef(function SidebarListItem(
  { list, isActive, onSelect, onRename, onDelete, onMove },
  ref
) {
  return (
    <li
      ref={ref}
      id={`list-${list.id}`}
      role="option"
      aria-selected={isActive}
      className={`sidebar-list-item ${isActive ? 'active' : ''}`}
      tabIndex={isActive ? 0 : -1}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          onMove(1);
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          onMove(-1);
        }
      }}
    >
      <div className="sidebar-list-label">
        <span className="sidebar-list-name">{list.name}</span>
        <span className="sidebar-badge" aria-label={`${list.items.length} items`}>
          {list.items.length}
        </span>
      </div>
      <div className="sidebar-list-actions">
        <button
          className="icon-button"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRename();
          }}
        >
          Rename
        </button>
        <button
          className="icon-button destructive"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
        >
          Delete
        </button>
      </div>
    </li>
  );
});

function ListSidebar({ isMobileOpen, onClose }) {
  const { state, actions } = useAppState();
  const itemRefs = useRef([]);

  useEffect(() => {
    itemRefs.current = [];
  }, [state.lists.length]);

  const handleAddList = () => {
    const name = prompt('List name:');
    if (name && name.trim()) {
      actions.addList(name.trim());
    }
  };

  const handleRename = (listId, currentName) => {
    const newName = prompt('Rename list:', currentName);
    if (newName && newName.trim()) {
      actions.updateList(listId, { name: newName.trim() });
    }
  };

  const handleDelete = (listId) => {
    if (confirm('Delete list and all items?')) {
      actions.deleteList(listId);
    }
  };

  return (
    <>
      <aside className={`sidebar ${isMobileOpen ? 'open' : ''}`} aria-label="Lists">
        <div className="sidebar-header">
          <h2>Lists</h2>
          <button className="button ghost" type="button" onClick={handleAddList}>
            + New List
          </button>
        </div>
        <ul
          className="sidebar-list"
          role="listbox"
          aria-label="Available lists"
          aria-activedescendant={state.activeListId ? `list-${state.activeListId}` : undefined}
        >
          {state.lists.length === 0 ? (
            <li className="sidebar-empty">
              <p>No lists yet — create your first one.</p>
            </li>
          ) : (
            state.lists.map((list, index) => (
              <SidebarListItem
                key={list.id}
                list={list}
                isActive={list.id === state.activeListId}
                onSelect={() => {
                  actions.setActiveList(list.id);
                  onClose();
                }}
                onRename={() => handleRename(list.id, list.name)}
                onDelete={() => handleDelete(list.id)}
                onMove={(direction) => {
                  const nextIndex = (index + direction + state.lists.length) % state.lists.length;
                  itemRefs.current[nextIndex]?.focus();
                }}
                ref={(element) => {
                  itemRefs.current[index] = element;
                }}
              />
            ))
          )}
        </ul>
        <button className="button primary sidebar-footer-button" type="button" onClick={handleAddList}>
          + New List
        </button>
      </aside>
      {isMobileOpen && <div className="sidebar-overlay" role="presentation" onClick={onClose} />}
    </>
  );
}

function OverflowMenu({ onExport, onImport, onClear, onRenameList }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="overflow-menu" ref={menuRef}>
      <button
        type="button"
        className="button ghost"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(prev => !prev)}
      >
        More
      </button>
      {open && (
        <div className="menu" role="menu">
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onRenameList(); }}>
            Rename list
          </button>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onExport(); }}>
            Export data
          </button>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onImport(); }}>
            Import data
          </button>
          <button
            type="button"
            role="menuitem"
            className="destructive"
            onClick={() => { setOpen(false); onClear(); }}
          >
            Clear all data
          </button>
        </div>
      )}
    </div>
  );
}

function FilterChips() {
  const { availableTags, activeTagFilters, toggleTagFilter, clearTagFilters } = useAppState();
  if (availableTags.length === 0) {
    return null;
  }
  const sortedTags = [...availableTags].sort((a, b) => {
    const aSelected = activeTagFilters.includes(a);
    const bSelected = activeTagFilters.includes(b);
    if (aSelected === bSelected) {
      return a.localeCompare(b);
    }
    return aSelected ? -1 : 1;
  });
  return (
    <div className="chip-row" role="list" aria-label="Tag filters">
      <button
        type="button"
        className={`chip ${activeTagFilters.length === 0 ? 'selected' : ''}`}
        onClick={clearTagFilters}
      >
        All
      </button>
      {sortedTags.map(tag => (
        <button
          key={tag}
          type="button"
          className={`chip ${activeTagFilters.includes(tag) ? 'selected' : ''}`}
          onClick={() => toggleTagFilter(tag)}
        >
          #{tag}
        </button>
      ))}
    </div>
  );
}

function AppBar({ onOpenSidebar }) {
  const {
    state,
    actions,
    searchText,
    setSearchText,
    sortOption,
    setSortOption,
    bulkSelectMode,
    toggleBulkSelectMode,
    getActiveList
  } = useAppState();
  const fileInputRef = useRef(null);
  const activeList = getActiveList();

  const handleExport = () => {
    const dataStr = JSON.stringify(state, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `list-app-backup-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleRenameList = () => {
    if (!activeList) return;
    const newName = prompt('Rename list:', activeList.name);
    if (newName && newName.trim()) {
      actions.updateList(activeList.id, { name: newName.trim() });
    }
  };

  const handleImportFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ({ target }) => {
      try {
        const imported = JSON.parse(target.result);
        if (confirm('Import data? This will replace your current data.')) {
          actions.importState(imported);
          alert('Data imported successfully.');
        }
      } catch (error) {
        alert(`Import failed: ${error.message}`);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  return (
    <header className="app-bar" role="banner">
      <div className="app-bar-top">
        <button className="button ghost mobile-only" type="button" onClick={onOpenSidebar}>
          Lists
        </button>
        <div className="app-brand" aria-label="List App">
          <span role="img" aria-hidden="true">📝</span> Lists
        </div>
        <div className="app-bar-controls">
          <div className="search-field">
            <input
              type="search"
              placeholder="Search title, notes, #tags"
              value={searchText}
              onChange={event => setSearchText(event.target.value)}
              aria-label="Search items"
            />
          </div>
          <div className="select-field">
            <label htmlFor="sortSelect" className="sr-only">Sort</label>
            <select
              id="sortSelect"
              value={sortOption}
              onChange={event => setSortOption(event.target.value)}
              aria-label="Sort items"
            >
              {SORT_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className={`button ghost ${bulkSelectMode ? 'active' : ''}`}
            onClick={toggleBulkSelectMode}
            aria-pressed={bulkSelectMode}
          >
            {bulkSelectMode ? 'Cancel' : 'Select'}
          </button>
          <OverflowMenu
            onExport={handleExport}
            onImport={handleImport}
            onClear={() => {
              if (confirm('Clear all lists and items?')) {
                actions.clearStorage();
              }
            }}
            onRenameList={handleRenameList}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImportFile}
            className="visually-hidden"
          />
        </div>
      </div>
      <FilterChips />
    </header>
  );
}

function ItemEditor() {
  const { actions, getActiveList } = useAppState();
  const activeList = getActiveList();
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [tags, setTags] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);

  useEffect(() => {
    setTitle('');
    setNote('');
    setTags('');
    setTitleTouched(false);
  }, [activeList?.id]);

  const handleSubmit = (event) => {
    event.preventDefault();
    setTitleTouched(true);
    if (!title.trim()) {
      return;
    }
    actions.addItem(title, note, tags);
    setTitle('');
    setNote('');
    setTags('');
    setTitleTouched(false);
  };

  const titleError = titleTouched && !title.trim();

  return (
    <form className="item-editor" onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label htmlFor="itemTitle">Title *</label>
        <input
          id="itemTitle"
          type="text"
          value={title}
          onChange={event => setTitle(event.target.value)}
          onBlur={() => setTitleTouched(true)}
          placeholder="Add a place or task"
          aria-invalid={titleError}
          aria-describedby={titleError ? 'titleHelp' : undefined}
          required
        />
        <p id="titleHelp" className={`field-help ${titleError ? 'error' : ''}`}>
          {titleError ? 'A title is required.' : 'Keep it short and descriptive.'}
        </p>
      </div>
      <div className="field">
        <label htmlFor="itemNote">Note</label>
        <textarea
          id="itemNote"
          value={note}
          onChange={event => setNote(event.target.value)}
          rows={2}
          placeholder="Optional details"
        />
      </div>
      <div className="field">
        <label htmlFor="itemTags">Tags</label>
        <input
          id="itemTags"
          type="text"
          value={tags}
          onChange={event => setTags(event.target.value)}
          placeholder="Comma-separated (e.g., italian, date-night)"
        />
      </div>
      <div className="editor-actions">
        <button className="button primary" type="submit">
          Add item
        </button>
      </div>
    </form>
  );
}

function ItemTag({ tag }) {
  const { toggleTagFilter } = useAppState();
  return (
    <button type="button" className="tag-chip" onClick={(event) => {
      event.stopPropagation();
      toggleTagFilter(tag);
    }}>
      #{tag}
    </button>
  );
}

function ItemRow({ item }) {
  const {
    actions,
    bulkSelectMode,
    selectedItemIds,
    toggleItemSelection
  } = useAppState();

  const isSelected = selectedItemIds.has(item.id);

  const handleToggleDone = () => {
    actions.updateItem(item.id, { done: !item.done });
  };

  const handleDuplicate = () => {
    actions.duplicateItem(item.id);
  };

  const handleDelete = () => {
    actions.deleteItem(item.id);
  };

  const handleEdit = () => {
    const title = prompt('Edit title:', item.title);
    if (title === null) return;
    const note = prompt('Edit note:', item.note || '') ?? undefined;
    const tags = prompt('Edit tags (comma-separated):', item.tags?.join(', ') || '') ?? '';
    actions.updateItem(item.id, {
      title: title.trim() || item.title,
      note: note?.trim() || undefined,
      tags: tags
        ? tags.split(',').map(tag => tag.trim()).filter(Boolean)
        : []
    });
  };

  const handleRowClick = () => {
    if (!bulkSelectMode) return;
    toggleItemSelection(item.id);
  };

  const handleRowKeyDown = (event) => {
    if (!bulkSelectMode) {
      if (event.key === 'Enter') {
        handleEdit();
      }
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleItemSelection(item.id);
    }
  };

  const formatDate = (timestamp) => new Date(timestamp).toLocaleDateString();

  return (
    <article
      className={`item-row ${item.done ? 'done' : ''} ${isSelected ? 'selected' : ''}`}
      tabIndex={0}
      role={bulkSelectMode ? 'option' : 'group'}
      aria-selected={bulkSelectMode ? isSelected : undefined}
      onClick={handleRowClick}
      onKeyDown={handleRowKeyDown}
    >
      <div className="item-leading">
        <input
          type="checkbox"
          className="done-checkbox"
          checked={item.done}
          onChange={handleToggleDone}
          aria-label={item.done ? 'Mark as not done' : 'Mark as done'}
          disabled={bulkSelectMode}
        />
      </div>
      <div className="item-body">
        <div className="item-text">
          <h3 className="item-title" title={item.title}>{item.title}</h3>
          {item.note && <p className="item-note">{item.note}</p>}
          <div className="item-meta">Added {formatDate(item.createdAt)}</div>
        </div>
        {item.tags?.length > 0 && (
          <div className="item-tags" aria-label="Item tags">
            {item.tags.map(tag => (
              <ItemTag key={tag} tag={tag} />
            ))}
          </div>
        )}
      </div>
      <div className="item-actions" aria-label="Quick actions">
        <button type="button" className="button ghost" onClick={(event) => { event.stopPropagation(); handleEdit(); }}>
          Edit
        </button>
        <button type="button" className="button ghost" onClick={(event) => { event.stopPropagation(); handleDuplicate(); }}>
          Duplicate
        </button>
        <button type="button" className="button ghost destructive" onClick={(event) => { event.stopPropagation(); handleDelete(); }}>
          Delete
        </button>
      </div>
    </article>
  );
}

function EmptyState({ title, description, icon }) {
  return (
    <div className="empty-state" role="status">
      <div className="empty-illustration" aria-hidden="true">{icon}</div>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

function BulkActionsBar() {
  const {
    state,
    actions,
    bulkSelectMode,
    selectedItemIds,
    toggleBulkSelectMode
  } = useAppState();

  if (!bulkSelectMode) return null;

  const selectedIds = Array.from(selectedItemIds);
  const selectedCount = selectedIds.length;
  const hasSelection = selectedCount > 0;

  const handleMove = () => {
    const lists = state.lists.filter(list => list.id !== state.activeListId);
    if (lists.length === 0) {
      alert('Create another list before moving items.');
      return;
    }
    const message = `Move to which list?\n${lists.map((list, index) => `${index + 1}. ${list.name}`).join('\n')}`;
    const input = prompt(message);
    if (!input) return;
    const index = Number.parseInt(input, 10) - 1;
    const target = lists[index];
    if (!target) {
      alert('Invalid selection.');
      return;
    }
    actions.moveItems(selectedIds, target.id);
  };

  return (
    <div className="bulk-bar" role="region" aria-label="Bulk actions">
      <div className="bulk-bar-info">
        <span>{hasSelection ? `${selectedCount} selected` : 'Select items to act on'}</span>
      </div>
      <div className="bulk-bar-actions">
        <button
          type="button"
          className="button ghost"
          disabled={!hasSelection}
          onClick={() => actions.bulkMarkDone(selectedIds, true)}
        >
          Mark done
        </button>
        <button
          type="button"
          className="button ghost"
          disabled={!hasSelection}
          onClick={handleMove}
        >
          Move
        </button>
        <button
          type="button"
          className="button ghost destructive"
          disabled={!hasSelection}
          onClick={() => {
            if (confirm('Delete selected items?')) {
              actions.bulkDeleteItems(selectedIds);
            }
          }}
        >
          Delete
        </button>
        <button
          type="button"
          className="button primary"
          onClick={toggleBulkSelectMode}
        >
          Done
        </button>
      </div>
    </div>
  );
}

function ItemsPanel() {
  const { getActiveList, getFilteredItems, bulkSelectMode } = useAppState();
  const activeList = getActiveList();
  const filteredItems = getFilteredItems();

  if (!activeList) {
    return (
      <section className="items-panel" aria-live="polite">
        <EmptyState
          icon="📋"
          title="No lists yet"
          description="Create a list to start capturing your ideas."
        />
      </section>
    );
  }

  const hasItems = activeList.items.length > 0;
  const hasFilteredResults = filteredItems.length > 0;

  return (
    <section className="items-panel" aria-live="polite">
      <header className="items-header">
        <div>
          <h2>{activeList.name}</h2>
          <p className="items-subtitle">{activeList.items.length} total items</p>
        </div>
      </header>
      <ItemEditor />
      {!hasItems && (
        <EmptyState
          icon="✨"
          title="No places yet"
          description="Add your first pick to start building the list."
        />
      )}
      {hasItems && !hasFilteredResults && (
        <EmptyState
          icon="🔍"
          title="No matches"
          description="Clear filters or try a different term."
        />
      )}
      {hasFilteredResults && (
        <div
          className={`items-list ${bulkSelectMode ? 'bulk-mode' : ''}`}
          role={bulkSelectMode ? 'listbox' : 'list'}
          aria-multiselectable={bulkSelectMode || undefined}
        >
          {filteredItems.map(item => (
            <ItemRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}

function App() {
  const { state, actions } = useAppState();
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (state.lists.length === 0) {
      actions.addList('My First List');
    } else if (!state.activeListId && state.lists.length > 0) {
      actions.setActiveList(state.lists[0].id);
    }
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
  }, [state.activeListId]);

  return (
    <div className="app">
      <AppBar onOpenSidebar={() => setSidebarOpen(true)} />
      <main className="layout">
        <ListSidebar isMobileOpen={isSidebarOpen} onClose={() => setSidebarOpen(false)} />
        <ItemsPanel />
      </main>
      <BulkActionsBar />
    </div>
  );
}

export default function Root() {
  return (
    <AppStateProvider>
      <App />
    </AppStateProvider>
  );
}
