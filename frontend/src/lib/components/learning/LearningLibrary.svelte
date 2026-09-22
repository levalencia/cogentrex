<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { Download, ExternalLink, RefreshCw, Play, Headphones, Eye, Brain, FileQuestion, BookOpen, Layout, BarChart3, Puzzle, FileText } from 'lucide-svelte';
  import {
    getLearningArtifact,
    getMediaAccess,
    loadLearningLibrary,
    type LearningArtifactDetail,
    type LearningArtifactSummary,
    type LearningLibraryCatalog,
  } from '$lib/learning-artifacts';
  import PresentationPlayer from './PresentationPlayer.svelte';
  import DiagramViewer from './DiagramViewer.svelte';
  import InfographicViewer from './InfographicViewer.svelte';
  import AudioLessonPlayer from './AudioLessonPlayer.svelte';
  import MindMapViewer from './MindMapViewer.svelte';
  import FlashcardPlayer from './FlashcardPlayer.svelte';
  import QuizPlayer from './QuizPlayer.svelte';
  import StudyGuideViewer from './StudyGuideViewer.svelte';
  import VideoLessonPlayer from './VideoLessonPlayer.svelte';

  const typeConfig: Record<string, { label: string; icon: typeof Play; color: string }> = {
    video: { label: 'Video', icon: Play, color: '--cogentrex-orange-glow' },
    audio: { label: 'Audio', icon: Headphones, color: '--cogentrex-orange-glow' },
    podcast: { label: 'Podcast', icon: Headphones, color: '--cogentrex-orange-glow' },
    deck: { label: 'Deck', icon: Layout, color: '--accent' },
    diagram: { label: 'Diagram', icon: BarChart3, color: '--accent' },
    infographic: { label: 'Infographic', icon: Eye, color: '--accent' },
    'mind-map': { label: 'Mind map', icon: Brain, color: '--accent' },
    flashcards: { label: 'Flashcards', icon: Puzzle, color: '--accent' },
    quiz: { label: 'Quiz', icon: FileQuestion, color: '--accent' },
    'study-guide': { label: 'Study guide', icon: BookOpen, color: '--accent' },
  };

  const packColors = [
    'rgba(255,107,53,.08)', 'rgba(53,162,255,.08)',
    'rgba(76,201,122,.08)', 'rgba(255,198,53,.08)',
    'rgba(168,85,247,.08)', 'rgba(236,72,153,.08)',
  ];

  let catalog = $state<LearningLibraryCatalog | null>(null);
  let selectedArtifact = $state<{ packTitle: string; summary: LearningArtifactSummary } | null>(null);
  let detail = $state<LearningArtifactDetail | null>(null);
  let mediaUrl = $state('');
  let playbackSeconds = $state<number | undefined>();
  let loading = $state(true);
  let error = $state('');

  async function openArtifact(
    packTitle: string,
    summary: LearningArtifactSummary,
  ) {
    selectedArtifact = { packTitle, summary };
    detail = null;
    mediaUrl = '';
    error = '';
    playbackSeconds = Number.isFinite(Number(page.url.searchParams.get('t')))
      ? Math.max(0, Number(page.url.searchParams.get('t')))
      : undefined;
    try {
      detail = await getLearningArtifact(summary.id);
      if (['audio', 'podcast', 'video'].includes(summary.type)) {
        mediaUrl = (await getMediaAccess(summary.id)).url;
      }
      const params = new URLSearchParams(page.url.searchParams);
      params.set('view', 'media');
      params.set('artifact', summary.id);
      history.replaceState({}, '', `/learn?${params.toString()}`);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Unable to load learning artifact';
    }
  }

  function closeDetail() {
    selectedArtifact = null;
    detail = null;
    mediaUrl = '';
    error = '';
  }

  async function openPrimary() {
    if (!selectedArtifact) return;
    const access = await getMediaAccess(selectedArtifact.summary.id);
    window.open(access.url, '_blank', 'noopener');
  }

  onMount(async () => {
    try {
      catalog = await loadLearningLibrary();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Learning library unavailable';
    } finally {
      loading = false;
    }
  });
</script>

<section aria-labelledby="media-heading">
  <div class="view-intro"><span class="eyebrow">Media</span><h2 id="media-heading">Review Cogentrex through video, audio, and study tools</h2><p>Every artifact across all learning packs in one view. Click any card to open it.</p></div>

  {#if loading}
    <div class="empty-state" aria-busy="true">Loading the published learning library…</div>
  {:else if error && !catalog}
    <div class="empty-state empty-state--error" role="status">
      <strong>Learning media is not published in this runtime.</strong>
      <span>{error}</span>
      <span>The evidence-grounded generation recipes remain available in the repository.</span>
    </div>
  {:else if catalog}
    {#if selectedArtifact}
      <!-- Detail view -->
      <div class="detail-view">
        <header class="detail-head">
          <div>
            <span class="eyebrow" style="color: var({typeConfig[selectedArtifact.summary.type]?.color ?? '--accent'})">
              {typeConfig[selectedArtifact.summary.type]?.label ?? selectedArtifact.summary.type}
            </span>
            <h3>{selectedArtifact.summary.title}</h3>
            <p class="detail-pack">{selectedArtifact.packTitle}</p>
            {#if selectedArtifact.summary.status === 'stale'}
              <p class="detail-status detail-status--stale">Published artifact — source changes detected.</p>
            {:else if selectedArtifact.summary.status === 'review-ready'}
              <p class="detail-status detail-status--review">Generated and technically verified — Luis review pending.</p>
            {:else}
              <p class="detail-status">Published and checksum-verified.</p>
            {/if}
          </div>
          <div class="detail-actions">
            <button onclick={closeDetail} class="btn btn--ghost" aria-label="Close">✕</button>
            <button onclick={openPrimary} class="btn btn--icon" aria-label="Open or download primary artifact">
              <Download size={15}/> Open file
            </button>
          </div>
        </header>

        {#if error}
          <div class="empty-state empty-state--error" role="alert">{error}</div>
        {/if}

        {#if detail?.content}
          {@const content = detail.content as any}
          {#if selectedArtifact.summary.type === 'deck'}
            <PresentationPlayer {content} sourceCommit={selectedArtifact.summary.source_commit}/>
          {:else if selectedArtifact.summary.type === 'diagram'}
            <DiagramViewer {content} sourceCommit={selectedArtifact.summary.source_commit}/>
          {:else if selectedArtifact.summary.type === 'infographic'}
            <InfographicViewer {content} sourceCommit={selectedArtifact.summary.source_commit}/>
          {:else if selectedArtifact.summary.type === 'audio' || selectedArtifact.summary.type === 'podcast'}
            {#if mediaUrl}
              <AudioLessonPlayer title={selectedArtifact.summary.title} {mediaUrl} {content} limitations={selectedArtifact.summary.limitations} sourceCommit={selectedArtifact.summary.source_commit}/>
            {/if}
          {:else if selectedArtifact.summary.type === 'mind-map'}
            <MindMapViewer root={content.root} sourceCommit={selectedArtifact.summary.source_commit}/>
          {:else if selectedArtifact.summary.type === 'flashcards'}
            <FlashcardPlayer cards={content.cards} sourceCommit={selectedArtifact.summary.source_commit}/>
          {:else if selectedArtifact.summary.type === 'quiz'}
            <QuizPlayer questions={content.questions} sourceCommit={selectedArtifact.summary.source_commit}/>
          {:else if selectedArtifact.summary.type === 'study-guide'}
            <StudyGuideViewer sections={content.sections} sourceCommit={selectedArtifact.summary.source_commit}/>
          {:else if selectedArtifact.summary.type === 'video'}
            {#if mediaUrl}
              <VideoLessonPlayer title={selectedArtifact.summary.title} {mediaUrl} {content} limitations={selectedArtifact.summary.limitations} sourceCommit={selectedArtifact.summary.source_commit} durationSeconds={selectedArtifact.summary.duration_seconds} initialTime={playbackSeconds} onTimeChange={(seconds) => playbackSeconds = seconds}/>
            {/if}
          {:else}
            <div class="empty-state">This accepted artifact can be opened as a file.</div>
          {/if}
        {:else if selectedArtifact}
          <div class="empty-state"><RefreshCw size={18}/> Loading {selectedArtifact.summary.title}…</div>
        {/if}

        <details class="provenance">
          <summary>Provenance and limitations</summary>
          <p>Source commit <code>{selectedArtifact.summary.source_commit.slice(0,12)}</code> · SHA-256 <code>{selectedArtifact.summary.sha256.slice(0,16)}…</code></p>
          <ul>{#each selectedArtifact.summary.limitations as item}<li>{item}</li>{/each}</ul>
        </details>
      </div>
    {:else}
      <!-- Grid view: artifacts grouped by pack -->
      <div class="pack-sections">
        {#each catalog.packs as pack, pIdx}
          <section class="pack-section">
            <h3 class="pack-heading" style="--pack-color: {packColors[pIdx % packColors.length]}">{pack.title}</h3>
            <div class="card-grid">
              {#each pack.artifacts as artifact}
                {@const config = typeConfig[artifact.type] ?? { label: artifact.type, icon: FileText, color: '--accent' }}
                <button
                  onclick={() => openArtifact(pack.title, artifact)}
                  class="card"
                >
                  <div class="card-icon" style="background: {packColors[pIdx % packColors.length]};">
                    {#if config.icon === Play}<Play size={22} style="color: var({config.color})"/>
                    {:else if config.icon === Headphones}<Headphones size={22} style="color: var({config.color})"/>
                    {:else if config.icon === Layout}<Layout size={22} style="color: var({config.color})"/>
                    {:else if config.icon === BarChart3}<BarChart3 size={22} style="color: var({config.color})"/>
                    {:else if config.icon === Eye}<Eye size={22} style="color: var({config.color})"/>
                    {:else if config.icon === Brain}<Brain size={22} style="color: var({config.color})"/>
                    {:else if config.icon === Puzzle}<Puzzle size={22} style="color: var({config.color})"/>
                    {:else if config.icon === FileQuestion}<FileQuestion size={22} style="color: var({config.color})"/>
                    {:else if config.icon === BookOpen}<BookOpen size={22} style="color: var({config.color})"/>
                    {:else}<FileText size={22} style="color: var({config.color})"/>
                    {/if}
                  </div>
                  <div class="card-body">
                    <span class="card-type">{config.label}</span>
                    <strong class="card-title">{artifact.title}</strong>
                  </div>
                  <div class="card-badge {artifact.status}">{artifact.status === 'published' ? '✓' : artifact.status === 'review-ready' ? 'R' : '!'}</div>
                </button>
              {/each}
            </div>
          </section>
        {/each}
      </div>

      {#if catalog.packs.every(p => p.artifacts.length === 0)}
        <div class="empty-state">No artifacts are available. Run the media generation pipeline first.</div>
      {/if}
    {/if}
  {/if}
</section>

<style>
  .empty-state {
    display: flex;
    align-items: center;
    gap: .5rem;
    min-height: 120px;
    border: 1px solid var(--border);
    border-radius: .85rem;
    background: var(--panel);
    padding: 1.5rem;
    color: var(--muted);
  }
  .empty-state--error {
    flex-direction: column;
    align-items: flex-start;
    border-color: rgba(240,189,98,.4);
    background: rgba(240,189,98,.06);
    color: var(--warning);
  }

  /* Card grid */
  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: .85rem;
  }

  .card {
    display: flex;
    align-items: flex-start;
    gap: .85rem;
    min-height: 88px;
    border: 1px solid var(--border);
    border-radius: .85rem;
    background: var(--panel);
    padding: .85rem;
    text-align: left;
    color: var(--text);
    cursor: pointer;
    transition: border-color .15s, box-shadow .15s;
  }
  .card:hover {
    border-color: var(--accent);
    box-shadow: 0 0 18px var(--cogentrex-orange-glow);
  }

  .card-icon {
    flex: 0 0 46px;
    display: grid;
    place-items: center;
    width: 46px;
    height: 46px;
    border-radius: .65rem;
  }

  .card-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: .15rem;
  }
  .card-type {
    font: 700 .6rem var(--font-mono);
    color: var(--accent);
    text-transform: uppercase;
    letter-spacing: .08em;
  }
  .card-title {
    font-size: .8rem;
    line-height: 1.3;
    line-clamp: 2;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .card-pack {
    font-size: .65rem;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .card-badge {
    flex: 0 0 22px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-size: .6rem;
    font-weight: 700;
    background: rgba(76,201,122,.15);
    color: rgb(76,201,122);
  }
  .card-badge.review-ready {
    background: rgba(240,189,98,.15);
    color: rgb(240,189,98);
  }
  .card-badge.stale {
    background: rgba(255,107,114,.15);
    color: rgb(255,107,114);
  }

  /* Pack sections */
  .pack-sections {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  .pack-section {
    display: flex;
    flex-direction: column;
    gap: .65rem;
  }
  .pack-heading {
    font-size: .8rem;
    font-weight: 700;
    letter-spacing: .04em;
    color: var(--secondary);
    margin: 0;
    padding: 0 0 .25rem;
    border-bottom: 1px solid var(--border);
  }

  /* Detail view */
  .detail-view {
    border: 1px solid var(--border);
    border-radius: .85rem;
    background: var(--panel);
    padding: 1.25rem;
  }

  .detail-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    margin-bottom: 1.25rem;
  }
  .detail-head h3 {
    font-size: 1.35rem;
    margin: .35rem 0 .15rem;
    line-height: 1.2;
  }
  .detail-pack {
    font-size: .72rem;
    color: var(--muted);
    margin: .2rem 0;
  }
  .detail-status {
    font-size: .72rem;
    color: rgb(76,201,122);
    margin: .2rem 0;
  }
  .detail-status--stale { color: rgb(255,107,114); }
  .detail-status--review { color: rgb(240,189,98); }

  .detail-actions {
    display: flex;
    align-items: center;
    gap: .5rem;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: .4rem;
    min-height: 38px;
    border: 1px solid var(--border);
    border-radius: .6rem;
    background: var(--bg);
    color: var(--text);
    padding: .5rem .75rem;
    font-size: .8rem;
    cursor: pointer;
  }
  .btn--ghost {
    border: none;
    background: transparent;
    padding: .5rem;
    color: var(--muted);
  }
  .btn--ghost:hover { color: var(--text); }
  .btn--icon { min-width: 38px; justify-content: center; }

  .provenance {
    margin-top: 1.25rem;
    border-top: 1px solid var(--border);
    padding-top: 1rem;
    color: var(--muted);
    font-size: .75rem;
  }
  .provenance code { font-size: .68rem; }

  @media (max-width: 640px) {
    .card-grid {
      grid-template-columns: 1fr;
    }
  }
</style>