declare module 'wappalyzer/wappalyzer' {
  const WappalyzerCore: {
    technologies: unknown[];
    requires: unknown[];
    categoryRequires: unknown[];
    setTechnologies(technologies: Record<string, unknown>): void;
    setCategories(categories: Record<string, unknown>): void;
    // Detection engine used without the driver of the package (see `wappalyzer-stealth.ts`)
    analyze(items: Record<string, unknown>, technologies?: unknown[]): unknown[];
    analyzeManyToMany(technology: unknown, types: string, items: Record<string, unknown[]>): unknown[];
    resolve(detections: unknown[]): any[];
  };

  export default WappalyzerCore;
}
