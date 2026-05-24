'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { AccountMenu } from '@/components/AccountMenu';
import { getCockpitNavItems } from '@/lib/cockpitNav';
import { useAppStore } from '@/store/appStore';

function modeLabel(mode: string): string {
  if (mode === 'DEEP_RESEARCH') return 'Deep research';
  if (mode === 'IMAGE_GENERATION') return 'Image';
  if (mode === 'VIDEO_GENERATION') return 'Video';
  if (mode === 'SOCIAL_WRITING') return 'Social';
  return 'Chat';
}

export function Sidebar() {
  const user = useAppStore((state) => state.user);
  const conversations = useAppStore((state) => state.conversations);
  const projects = useAppStore((state) => state.projects);
  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const activeConversationId = useAppStore((state) => state.activeConversationId);
  const renameConversation = useAppStore((state) => state.renameConversation);
  const togglePinConversation = useAppStore((state) => state.togglePinConversation);
  const deleteConversation = useAppStore((state) => state.deleteConversation);
  const deleteAllConversations = useAppStore((state) => state.deleteAllConversations);
  const clearChat = useAppStore((state) => state.clearChat);
  const setActiveProject = useAppStore((state) => state.setActiveProject);
  const assignConversationToProject = useAppStore((state) => state.assignConversationToProject);
  const createProject = useAppStore((state) => state.createProject);
  const deleteProject = useAppStore((state) => state.deleteProject);
  const router = useRouter();
  const pathname = usePathname();
  const cockpitNavItems = getCockpitNavItems(user?.role, pathname);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [showProjectMenu, setShowProjectMenu] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);

  function startRename(conversation: typeof conversations[number]) {
    setEditingId(conversation.id);
    setEditTitle(conversation.title);
  }

  async function submitRename(id: string) {
    if (editTitle.trim()) {
      await renameConversation(id, editTitle.trim());
    }
    setEditingId(null);
  }

  async function handlePin(id: string, pinned: boolean) {
    await togglePinConversation(id, !pinned);
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this conversation?')) return;
    await deleteConversation(id);
  }

  async function handleAssignProject(conversationId: string, projectId: string | null) {
    await assignConversationToProject(conversationId, projectId);
    setShowProjectMenu(null);
  }

  async function handleCreateProject() {
    const name = newProjectName.trim();
    if (!name) return;
    await createProject(name);
    setNewProjectName('');
    setCreatingProject(false);
  }

  function handleNewChat() {
    clearChat();
    router.push('/');
  }

  function handleConversationClick(id: string) {
    router.push(`/chats/${id}`);
  }

  return (
    <aside className="hidden h-full w-72 shrink-0 flex-col border-r border-line bg-panel/80 lg:flex">
      <AccountMenu />

      {/* New Chat */}
      <div className="space-y-3 p-3">
        <button onClick={handleNewChat} className="w-full rounded-2xl bg-accent px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-white">New workflow</button>
        <nav className="space-y-1" aria-label="Cogentrex cockpit">
          {cockpitNavItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => router.push(item.href)}
              className={`w-full rounded-2xl border px-4 py-3 text-left transition ${item.isActive ? 'border-accent bg-accent/10 text-accent' : 'border-line text-slate-300 hover:border-accent hover:bg-white/5'}`}
            >
              <span className="block text-sm font-semibold">{item.label}</span>
              <span className="mt-0.5 block text-xs text-slate-500">{item.description}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Project Filter */}
      <div className="px-3 pb-2">
        <label className="mb-1 block text-xs font-medium text-slate-500">Project</label>
        <select
          value={activeProjectId === undefined ? '' : activeProjectId === null ? 'null' : activeProjectId}
          onChange={(e) => {
            const value = e.target.value;
            const parsed: string | null | undefined = value === '' ? undefined : value === 'null' ? null : value;
            void setActiveProject(parsed);
          }}
          className="w-full rounded-xl border border-line bg-ink px-3 py-2 text-sm text-white outline-none focus:border-accent"
        >
          <option value="">All conversations</option>
          <option value="null">No project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>{project.name}</option>
          ))}
        </select>
        {creatingProject ? (
          <div className="mt-2 flex gap-2">
            <input
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleCreateProject(); }}
              placeholder="Project name..."
              className="flex-1 rounded-lg border border-line bg-ink px-2 py-1 text-sm text-white outline-none focus:border-accent"
              autoFocus
            />
            <button onClick={() => void handleCreateProject()} className="rounded-lg bg-accent px-2 py-1 text-xs font-semibold text-ink">Create</button>
            <button onClick={() => { setCreatingProject(false); setNewProjectName(''); }} className="rounded-lg border border-line px-2 py-1 text-xs text-slate-400">Cancel</button>
          </div>
        ) : (
          <button onClick={() => setCreatingProject(true)} className="mt-2 text-xs text-slate-500 hover:text-slate-300">+ New project</button>
        )}
      </div>

      {/* Delete All */}
      <div className="px-3 pb-2">
        <button
          onClick={() => void deleteAllConversations()}
          className="w-full rounded-xl border border-red-500/30 px-3 py-2 text-xs text-red-300 hover:bg-red-500/10"
        >
          🗑️ Delete all chats
        </button>
      </div>

      {/* History List */}
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {conversations.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-600">No conversations yet</p>
        ) : (
          <div className="space-y-1">
            {conversations.map((conversation) => {
              const isActive = activeConversationId === conversation.id;
              return (
                <div key={conversation.id} className={`group relative rounded-xl transition ${isActive ? 'bg-accent/15' : 'hover:bg-white/5'}`}>
                  {editingId === conversation.id ? (
                    <div className="flex items-center gap-2 px-3 py-2">
                      <input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') void submitRename(conversation.id); }}
                        onBlur={() => void submitRename(conversation.id)}
                        className="flex-1 rounded bg-transparent text-sm text-white outline-none"
                        autoFocus
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 px-3 py-2">
                      <button
                        onClick={() => handleConversationClick(conversation.id)}
                        className="flex-1 truncate text-left text-sm text-slate-300"
                      >
                        {conversation.title || 'Untitled'}
                      </button>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => startRename(conversation)}
                          className="rounded p-1 text-xs text-slate-400 hover:bg-white/10 hover:text-white"
                          title="Rename"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => void handlePin(conversation.id, conversation.isPinned)}
                          className={`rounded p-1 text-xs ${conversation.isPinned ? 'text-accent' : 'text-slate-400 hover:bg-white/10 hover:text-white'}`}
                          title={conversation.isPinned ? 'Unpin' : 'Pin'}
                        >
                          📌
                        </button>
                        <div className="relative">
                          <button
                            onClick={() => setShowProjectMenu(showProjectMenu === conversation.id ? null : conversation.id)}
                            className="rounded p-1 text-xs text-slate-400 hover:bg-white/10 hover:text-white"
                            title="Assign to project"
                          >
                            📁
                          </button>
                          {showProjectMenu === conversation.id && (
                            <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-xl border border-line bg-panel py-1 shadow-xl">
                              <button
                                onClick={() => void handleAssignProject(conversation.id, null)}
                                className="block w-full px-3 py-1.5 text-left text-xs text-slate-300 hover:bg-white/5"
                              >
                                No project
                              </button>
                              {projects.map((project) => (
                                <button
                                  key={project.id}
                                  onClick={() => void handleAssignProject(conversation.id, project.id)}
                                  className={`block w-full px-3 py-1.5 text-left text-xs hover:bg-white/5 ${conversation.projectId === project.id ? 'text-accent' : 'text-slate-300'}`}
                                >
                                  {project.name}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => void handleDelete(conversation.id)}
                          className="rounded p-1 text-xs text-slate-400 hover:bg-red-500/20 hover:text-red-300"
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
