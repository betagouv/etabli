declare module 'wappalyzer/wappalyzer' {
  const WappalyzerCore: {
    requires: unknown[];
    categoryRequires: unknown[];
    setTechnologies(technologies: Record<string, unknown>): void;
    setCategories(categories: Record<string, unknown>): void;
  };

  export default WappalyzerCore;
}
