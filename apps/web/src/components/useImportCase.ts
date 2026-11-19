import { useStore } from '../store/store';

/** Open a file picker and import a Heirmap case file (JSON). */
export function useImportCase() {
  const importCase = useStore((s) => s.importCase);
  return () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json,.heirmap';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      try {
        importCase(JSON.parse(await f.text()));
      } catch (e) {
        window.alert(`Could not open that file: ${e instanceof Error ? e.message : String(e)}`);
      }
    };
    input.click();
  };
}
