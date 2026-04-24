declare module 'markdown-it-task-lists' {
  import MarkdownIt from 'markdown-it';
  interface TaskListsOptions {
    enabled?: boolean;
    label?: boolean;
    labelAfter?: boolean;
  }
  const taskLists: MarkdownIt.PluginWithOptions<TaskListsOptions>;
  export default taskLists;
}

declare module 'markdown-it-footnote' {
  import MarkdownIt from 'markdown-it';
  const footnote: MarkdownIt.PluginSimple;
  export default footnote;
}

declare module 'highlight.js/lib/core' {
  import hljs from 'highlight.js';
  export default hljs;
}

declare module 'highlight.js/lib/languages/*' {
  import { LanguageFn } from 'highlight.js';
  const lang: LanguageFn;
  export default lang;
}
