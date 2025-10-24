import React, { createContext, useContext, useState, useEffect, useRef } from 'react';

/*
  DEVELOPER NOTES
  ===============

  This file contains the full implementation of the React List App as
  provided in the original artifact. To simplify the bundling process
  within Create React App, the CSS has been extracted into a separate
  `App.css` file. The overall architecture remains the same:

  - App.jsx: Main component with state provider and UI components
  - Context-based state management with localStorage persistence
  - Components for the sidebar, toolbar, item editor and individual rows
  - Responsive layout and keyboard shortcuts

  The state management, component structure and functionality are
  identical to the specification provided in the artifact.
*/

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

const STORAGE_KEY = 'reactListAppState';
const APP_VERSION = '1.0.0';

const initialState = {
  lists: [],
  activeListId: null,
  appVersion: APP_VERSION
};

const AppStateContext = createContext(null);

function generateId() {
  // Use the browser's crypto API if available, otherwise fall back to a
  // timestamp-based ID. crypto.randomUUID is supported in modern
  // environments and will produce RFC‑compliant UUIDs.
  return (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random()}`;
}

function AppStateProvider({ children }) {
  const [state, setState] = useState(initialState);
  const [filterText, setFilterText] = useState('');

  // Load state on mount from localStorage. If parsing fails or the
  // structure is invalid, fall back to the initial state.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.lists && Array.isArray(parsed.lists)) {
          setState(parsed);
        }
      }
    } catch (e) {
      console.error('Failed to load state:', e);
    }
  }, []);

  // Persist state on every change to localStorage. Errors during
  // serialization or storage are logged but do not interrupt the app.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('Failed to save state:', e);
    }
  }, [state]);

  // Centralized actions for modifying the application state. Each action
  // triggers a state update via setState, ensuring that React
  // re-renders the components that consume the context.
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
        const newLists = prev.lists.filter(l => l.id !== listId);
        return {
          ...prev,
          lists: newLists,
          activeListId: prev.activeListId === listId
            ? (newLists.length > 0 ? newLists[0].id : null)
            : prev.activeListId
        };
      });
    },
    setActiveList: (listId) => {
      setState(prev => ({ ...prev, activeListId: listId }));
      setFilterText('');
    },
    addItem: (title, note, tags) => {
      if (!state.activeListId || !title.trim()) return;

      const newItem = {
        id: generateId(),
        title: title.trim(),
        note: note?.trim() || undefined,
        tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
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
    deleteItem: (itemId) => {
      setState(prev => ({
        ...prev,
        lists: prev.lists.map(list =>
          list.id === state.activeListId
            ? {
                ...list,
                items: list.items.filter(i => i.id !== itemId),
                updatedAt: Date.now()
              }
            : list
        )
      }));
    },
    importState: (importedState) => {
      // Validate the imported state structure. Throwing an error here
      // triggers the catch block in the import handler, allowing the
      // Toolbar component to display a meaningful error message to
      // the user.
      if (!importedState.lists || !Array.isArray(importedState.lists)) {
        throw new Error('Invalid format: missing or invalid lists array');
      }
      for (const list of importedState.lists) {
        if (!list.id || !list.name || !Array.isArray(list.items)) {
          throw new Error('Invalid format: malformed list data');
        }
      }
      setState({
        ...importedState,
        appVersion: importedState.appVersion || APP_VERSION
      });
    },
    clearStorage: () => {
      localStorage.removeItem(STORAGE_KEY);
      setState(initialState);
    }
  };

  // Helper to get the active list object from state
  const getActiveList = () => {
    return state.lists.find(l => l.id === state.activeListId);
  };

  // Returns items filtered by the current filter text. Supports
  // searching by tags when prefixed with '#'.
  const getFilteredItems = () => {
    const activeList = getActiveList();
    if (!activeList) return [];
    if (!filterText.trim()) return activeList.items;
    const query = filterText.toLowerCase().trim();
    const isTagSearch = query.startsWith('#');
    const searchTerm = isTagSearch ? query.slice(1) : query;
    return activeList.items.filter(item => {
      if (isTagSearch) {
        return item.tags?.some(tag => tag.toLowerCase().includes(searchTerm));
      }
      const titleMatch = item.title.toLowerCase().includes(searchTerm);
      const noteMatch = item.note?.toLowerCase().includes(searchTerm);
      const tagMatch = item.tags?.some(tag => tag.toLowerCase().includes(searchTerm));
      return titleMatch || noteMatch || tagMatch;
    });
  };

  return (
    <AppStateContext.Provider
      value={{
        state,
        filterText,
        setFilterText,
        actions,
        getActiveList,
        getFilteredItems
      }}
    >
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

// ============================================================================
// COMPONENTS - ListSidebar
// ============================================================================

function ListSidebar() {
  const { state, actions } = useAppState();

  const handleAddList = () => {
    const name = prompt('List name:');
    if (name !== null && name.trim()) {
      actions.addList(name.trim());
    }
  };

  const handleRename = (listId, currentName) => {
    const newName = prompt('Rename list:', currentName);
    if (newName !== null && newName.trim()) {
      actions.updateList(listId, { name: newName.trim() });
    }
  };

  const handleDelete = (listId) => {
    if (confirm('Delete this list and all its items?')) {
      actions.deleteList(listId);
    }
  };

  return (
    <aside className="sidebar">
      <div className="section-header">
        <h2>Lists</h2>
        <button className="btn btn-sm btn-primary" onClick={handleAddList}>
          + New
        </button>
      </div>
      <div className="lists-container">
        {state.lists.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <p>
              No lists yet.<br />
              Click "New" to create one!
            </p>
          </div>
        ) : (
          state.lists.map(list => (
            <div
              key={list.id}
              className={`list-item ${list.id === state.activeListId ? 'active' : ''}`}
              onClick={() => actions.setActiveList(list.id)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  actions.setActiveList(list.id);
                }
              }}
              tabIndex={0}
              role="button"
              aria-pressed={list.id === state.activeListId}
            >
              <span className="list-item-name">{list.name}</span>
              <div className="list-item-actions">
                <button
                  className="btn btn-sm"
                  onClick={e => {
                    e.stopPropagation();
                    handleRename(list.id, list.name);
                  }}
                  aria-label="Rename list"
                >
                  ✏️
                </button>
                <button
                  className="btn btn-sm btn-danger"
                  onClick={e => {
                    e.stopPropagation();
                    handleDelete(list.id);
                  }}
                  aria-label="Delete list"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

// ============================================================================
// COMPONENTS - Toolbar
// ============================================================================

function Toolbar() {
  const { state, filterText, setFilterText, actions } = useAppState();
  const fileInputRef = useRef(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Export the current state to a JSON file. We stringify the state
  // and create a blob for download. The filename includes a timestamp
  // for easier backups.
  const handleExport = () => {
    const dataStr = JSON.stringify(state, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `list-app-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Handle importing of JSON data. Reads the file, parses it and
  // attempts to replace the current state. Validation occurs in
  // actions.importState. Errors are caught and displayed to the user.
  const handleImport = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = event => {
      try {
        const imported = JSON.parse(event.target.result);
        if (confirm('Import data? This will replace your current data.')) {
          actions.importState(imported);
          setErrorMessage('');
          alert('Data imported successfully!');
        }
      } catch (error) {
        setErrorMessage(`Import failed: ${error.message}`);
        setTimeout(() => setErrorMessage(''), 5000);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <header className="header">
      <h1>📝 List App</h1>
      <div className="header-actions">
        <input
          type="text"
          className="filter-input-header"
          placeholder="Filter..."
          value={filterText}
          onChange={e => setFilterText(e.target.value)}
          aria-label="Filter items"
        />
        <button className="btn btn-sm" onClick={handleExport}>
          Export
        </button>
        <button className="btn btn-sm" onClick={() => fileInputRef.current?.click()}>
          Import
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleImport}
          style={{ display: 'none' }}
        />
      </div>
      {errorMessage && (
        <div className="error-message" role="alert">
          {errorMessage}
        </div>
      )}
    </header>
  );
}

// ============================================================================
// COMPONENTS - ItemEditor
// ============================================================================

function ItemEditor() {
  const { actions } = useAppState();
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [tags, setTags] = useState('');

  const handleSubmit = e => {
    e.preventDefault();
    if (title.trim()) {
      actions.addItem(title, note, tags);
      setTitle('');
      setNote('');
      setTags('');
    }
  };

  return (
    <form className="add-item-form" onSubmit={handleSubmit}>
      <div className="form-row">
        <label htmlFor="itemTitle">Title *</label>
        <input
          id="itemTitle"
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Buy groceries"
          required
        />
      </div>
      <div className="form-row">
        <label htmlFor="itemNote">Note</label>
        <textarea
          id="itemNote"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Optional details..."
          rows={2}
        />
      </div>
      <div className="form-row">
        <label htmlFor="itemTags">Tags (comma-separated)</label>
        <input
          id="itemTags"
          type="text"
          value={tags}
          onChange={e => setTags(e.target.value)}
          placeholder="shopping, urgent"
        />
      </div>
      <button type="submit" className="btn btn-primary">
        Add Item
      </button>
    </form>
  );
}

// ============================================================================
// COMPONENTS - ItemRow
// ============================================================================

function ItemRow({ item }) {
  const { actions } = useAppState();

  const handleToggleDone = () => {
    actions.updateItem(item.id, { done: !item.done });
  };

  const handleEdit = () => {
    const newTitle = prompt('Edit title:', item.title);
    if (newTitle === null) return;
    const newNote = prompt('Edit note:', item.note || '');
    if (newNote === null) return;
    const newTags = prompt('Edit tags (comma-separated):', item.tags?.join(', ') || '');
    if (newTags === null) return;
    actions.updateItem(item.id, {
      title: newTitle.trim() || item.title,
      note: newNote.trim() || undefined,
      tags: newTags ? newTags.split(',').map(t => t.trim()).filter(Boolean) : undefined
    });
  };

  const handleDelete = () => {
    actions.deleteItem(item.id);
  };

  const handleKeyDown = e => {
    if (e.key === 'e') {
      handleEdit();
    } else if (e.key === 'x') {
      handleToggleDone();
    } else if (e.key === 'Delete') {
      handleDelete();
    }
  };

  const formatDate = timestamp => {
    return new Date(timestamp).toLocaleDateString();
  };

  return (
    <div className={`item ${item.done ? 'done' : ''}`} tabIndex={0} onKeyDown={handleKeyDown}>
      <div className="item-header">
        <input
          type="checkbox"
          className="item-checkbox"
          checked={item.done}
          onChange={handleToggleDone}
          aria-label="Mark as done"
        />
        <div className="item-content">
          <div className={`item-title ${item.done ? 'done' : ''}`}>{item.title}</div>
          {item.note && <div className="item-note">{item.note}</div>}
          {item.tags && item.tags.length > 0 && (
            <div className="item-tags">
              {item.tags.map((tag, idx) => (
                <span key={idx} className="tag">
                  #{tag}
                </span>
              ))}
            </div>
          )}
          <div className="item-meta">Created: {formatDate(item.createdAt)}</div>
        </div>
        <div className="item-actions">
          <button className="btn btn-sm" onClick={handleEdit} aria-label="Edit item">
            ✏️
          </button>
          <button className="btn btn-sm btn-danger" onClick={handleDelete} aria-label="Delete item">
            🗑️
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================

function ItemsPanel() {
  const { getActiveList, getFilteredItems } = useAppState();
  const activeList = getActiveList();
  const filteredItems = getFilteredItems();
  if (!activeList) {
    return null;
  }
  return (
    <section className="panel">
      <div className="items-header">
        <h2>{activeList.name}</h2>
      </div>
      <ItemEditor />
      <div className="items-container">
        {activeList.items.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">✨</div>
            <p>
              No items yet.<br />Add your first item above!
            </p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🔍</div>
            <p>No items match your filter.</p>
          </div>
        ) : (
          filteredItems.map(item => <ItemRow key={item.id} item={item} />)
        )}
      </div>
    </section>
  );
}

function App() {
  const { state, actions } = useAppState();
  // Initialize with a default list if none exist
  useEffect(() => {
    if (state.lists.length === 0) {
      actions.addList('My First List');
    }
  }, []);
  return (
    <div className="app">
      <Toolbar />
      <main className="main">
        <ListSidebar />
        <ItemsPanel />
      </main>
    </div>
  );
}

// ============================================================================
// ROOT COMPONENT WITH PROVIDER
// ============================================================================

export default function Root() {
  return (
    <AppStateProvider>
      <App />
    </AppStateProvider>
  );
}
