<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { BookOpen, Compass, Layers, Library, Map, TableProperties } from 'lucide-svelte';
  import ArchitectureView from './ArchitectureView.svelte';
  import EvidenceView from './EvidenceView.svelte';
  import LearningLibrary from './LearningLibrary.svelte';
  import RoadmapView from './RoadmapView.svelte';
  import StoriesView from './StoriesView.svelte';
  import VocabularyView from './VocabularyView.svelte';
  import { loadVisualLearningStudio, type VisualLearningStudio } from '$lib/visual-learning';

  type StudioView = 'learn' | 'reference' | 'media';
  const views: Array<{ id: StudioView; label: string; question: string; icon: typeof Map }> = [
    { id: 'learn', label: 'Learn', question: 'What should I learn next?', icon: Compass },
    { id: 'reference', label: 'Reference', question: 'How is the system built and proven?', icon: Library },
    { id: 'media', label: 'Media', question: 'How do I review through video, audio, and study tools?', icon: BookOpen },
  ];

  let studio = $state<VisualLearningStudio | null>(null);
  let loading = $state(true);
  let error = $state('');
  function parseView(value: string | null): StudioView {
    const requested = value as StudioView | null;
    return requested && views.some(view => view.id === requested) ? requested : 'learn';
  }

  let activeView = $derived(parseView(page.url.searchParams.get('view')));

  onMount(() => {
    void loadVisualLearningStudio()
      .then(payload => { studio = payload; loading = false; })
      .catch(cause => {
        error = cause instanceof Error ? cause.message : 'Unable to load Visual Learning Studio';
        loading = false;
      });
  });
</script>

<div class="min-h-full bg-[var(--bg)] text-[var(--text)]">
  <header class="border-b border-[var(--border)] bg-[radial-gradient(circle_at_top_left,var(--cogentrex-orange-glow),transparent_38%),var(--panel)] px-4 py-6 md:px-8">
    <div class="mx-auto flex max-w-[1500px] flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
      <div class="max-w-3xl"><span class="eyebrow">Cogentrex Visual Learning Studio</span><h1 class="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">Choose the view that matches your question</h1><p class="mt-2 max-w-2xl text-sm leading-6 text-[var(--secondary)]">Stable roadmaps, explicit flows, layered architecture, evidence boundaries, and Hermes-authored English learning media — all derived from canonical project sources.</p></div>
      {#if studio}<div class="grid grid-cols-5 gap-2" aria-label="Visual Learning Studio summary"><div class="metric"><strong>{studio.stats.concepts}</strong><span>Concepts</span></div><div class="metric"><strong>{studio.stats.vocabulary_terms}</strong><span>Terms</span></div><div class="metric"><strong>{studio.stats.modules}</strong><span>Modules</span></div><div class="metric"><strong>{studio.stats.stories}</strong><span>Stories</span></div><div class="metric"><strong>{studio.stats.learning_packs}</strong><span>Packs</span></div></div>{/if}
    </div>
  </header>

  <nav class="sticky top-0 z-30 border-b border-[var(--border)] bg-[rgba(8,11,16,.94)] px-3 py-2 backdrop-blur" aria-label="Visual Learning Studio views">
    <div class="mx-auto grid max-w-[1500px] grid-cols-2 gap-2 pb-1 sm:grid-cols-4 xl:grid-cols-8">
      {#each views as view}
        <a href={`/learn?view=${view.id}`} aria-current={activeView === view.id ? 'page' : undefined} class="flex min-h-14 min-w-0 items-center gap-2 rounded-xl border px-3 text-left no-underline transition {activeView === view.id ? 'border-[var(--accent)] bg-[var(--accent-glow)] text-[var(--text)] shadow-[0_0_18px_var(--cogentrex-orange-glow)]' : 'border-[var(--border)] bg-[var(--panel)] text-[var(--muted)] hover:border-[var(--accent)]'}"><view.icon size={17}/><span class="min-w-0"><strong class="block text-xs">{view.label}</strong><small class="mt-0.5 block truncate text-[9px]">{view.question}</small></span></a>
      {/each}
    </div>
  </nav>

  <main class="mx-auto max-w-[1500px] p-3 md:p-6">
    {#if loading}<div class="grid min-h-[55vh] place-items-center rounded-2xl border border-[var(--border)] bg-[var(--panel)] text-sm text-[var(--muted)]">Loading structured learning views…</div>
    {:else if error}<div role="alert" class="rounded-xl border border-[rgba(255,107,114,.4)] bg-[rgba(255,107,114,.08)] p-4 text-sm text-[var(--danger)]">{error}</div>
    {:else if studio}
      {#if activeView === 'learn'}
        <div class="view-intro"><span class="eyebrow">Learn</span><h2>Guided learning path</h2><p>Start with the roadmap to understand what to learn next, then follow a workflow story to see how components interact.</p></div>
        <RoadmapView {studio}/>
        <StoriesView {studio}/>
      {:else if activeView === 'reference'}
        <div class="view-intro"><span class="eyebrow">Reference</span><h2>Architecture, evidence, and glossary</h2><p>Understand how the system is structured, what is actually implemented and proven, and look up any term.</p></div>
        <ArchitectureView {studio}/>
        <EvidenceView {studio}/>
        <VocabularyView {studio}/>
      {:else}
        <LearningLibrary/>
      {/if}
    {/if}
  </main>
</div>

<style>
  :global(.view-intro) { margin-bottom: 1.25rem; max-width: 52rem; }
  :global(.view-intro h2) { margin: .35rem 0 0; font-size: clamp(1.45rem, 3vw, 2rem); line-height: 1.2; }
  :global(.view-intro p) { margin: .55rem 0 0; color: var(--secondary); font-size: .875rem; line-height: 1.65; }
  :global(.eyebrow) { color: var(--accent); font-family: var(--font-mono); font-size: .65rem; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; }
  .metric { min-width: 74px; border: 1px solid var(--border); border-radius: .75rem; background: rgba(8,11,16,.55); padding: .55rem .7rem; text-align: center; }
  .metric strong { display: block; font-family: var(--font-mono); font-size: 1.1rem; }
  .metric span { color: var(--muted); font-size: .58rem; letter-spacing: .08em; text-transform: uppercase; }
</style>
