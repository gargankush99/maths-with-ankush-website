// Single source of truth for every downloadable resource on the site.
// Used by index.html (homepage "Free resources" section) AND by each grade-N.html page.
//
// To add a new resource: drop the file into resources/ (or a subfolder), then add one
// object below with the same shape. "grade" must be exactly "Grade 9" / "Grade 10" /
// "Grade 11" / "Grade 12" (matching text, including capital G) so it shows up on the
// right grade page and in the homepage filter. "section" groups cards into labeled
// sub-sections on each grade-N.html page (e.g. "Formula Sheet" vs "Chapter-wise Notes") —
// use the same section name for anything that should sit under one heading together.
window.RESOURCES = [
  { type: "PDF · Grade 12", title: "Grade 12 Formula Sheet", desc: "Every formula for the Grade 12 syllabus, handwritten for quick revision.", file: "resources/grade-12-formula-sheet.pdf", grade: "Grade 12", section: "Formula Sheet" },
  { type: "PDF · Grade 10", title: "Grade 10 Formula Sheet", desc: "Every formula for the Grade 10 syllabus, handwritten for quick revision.", file: "resources/grade-10-formula-sheet.pdf", grade: "Grade 10", section: "Formula Sheet" },

  { type: "Chapter Test · Grade 11", title: "Sets", desc: "Chapter-wise test — question paper only, no solutions included.", file: "resources/grade-11-chapterwise-tests/01-sets.pdf", grade: "Grade 11", section: "Chapter Tests" },
  { type: "Chapter Test · Grade 11", title: "Relations and Functions", desc: "Chapter-wise test — question paper only, no solutions included.", file: "resources/grade-11-chapterwise-tests/02-relations-and-functions.pdf", grade: "Grade 11", section: "Chapter Tests" },
  { type: "Chapter Test · Grade 11", title: "Trigonometric Functions", desc: "Chapter-wise test — question paper only, no solutions included.", file: "resources/grade-11-chapterwise-tests/03-trigonometric-functions.pdf", grade: "Grade 11", section: "Chapter Tests" },
  { type: "Chapter Test · Grade 11", title: "Complex Numbers and Quadratic Equations", desc: "Chapter-wise test — question paper only, no solutions included.", file: "resources/grade-11-chapterwise-tests/04-complex-numbers-and-quadratic-equations.pdf", grade: "Grade 11", section: "Chapter Tests" },
  { type: "Chapter Test · Grade 11", title: "Linear Inequalities", desc: "Chapter-wise test — question paper only, no solutions included.", file: "resources/grade-11-chapterwise-tests/05-linear-inequalities.pdf", grade: "Grade 11", section: "Chapter Tests" },
  { type: "Chapter Test · Grade 11", title: "Permutations and Combinations", desc: "Chapter-wise test — question paper only, no solutions included.", file: "resources/grade-11-chapterwise-tests/06-permutations-and-combinations.pdf", grade: "Grade 11", section: "Chapter Tests" },
  { type: "Chapter Test · Grade 11", title: "Binomial Theorem", desc: "Chapter-wise test — question paper only, no solutions included.", file: "resources/grade-11-chapterwise-tests/07-binomial-theorem.pdf", grade: "Grade 11", section: "Chapter Tests" },
  { type: "Chapter Test · Grade 11", title: "Sequences and Series", desc: "Chapter-wise test — question paper only, no solutions included.", file: "resources/grade-11-chapterwise-tests/08-sequences-and-series.pdf", grade: "Grade 11", section: "Chapter Tests" },
  { type: "Chapter Test · Grade 11", title: "Straight Lines", desc: "Chapter-wise test — question paper only, no solutions included.", file: "resources/grade-11-chapterwise-tests/09-straight-lines.pdf", grade: "Grade 11", section: "Chapter Tests" },
  { type: "Chapter Test · Grade 11", title: "Conic Sections", desc: "Chapter-wise test — question paper only, no solutions included.", file: "resources/grade-11-chapterwise-tests/10-conic-sections.pdf", grade: "Grade 11", section: "Chapter Tests" },
  { type: "Chapter Test · Grade 11", title: "Introduction to 3D Geometry", desc: "Chapter-wise test — question paper only, no solutions included.", file: "resources/grade-11-chapterwise-tests/11-introduction-to-3d-geometry.pdf", grade: "Grade 11", section: "Chapter Tests" },
  { type: "Chapter Test · Grade 11", title: "Limits and Derivatives", desc: "Chapter-wise test — question paper only, no solutions included.", file: "resources/grade-11-chapterwise-tests/12-limits-and-derivatives.pdf", grade: "Grade 11", section: "Chapter Tests" },
  { type: "Chapter Test · Grade 11", title: "Statistics", desc: "Chapter-wise test — question paper only, no solutions included.", file: "resources/grade-11-chapterwise-tests/13-statistics.pdf", grade: "Grade 11", section: "Chapter Tests" },
  { type: "Chapter Test · Grade 11", title: "Probability", desc: "Chapter-wise test — question paper only, no solutions included.", file: "resources/grade-11-chapterwise-tests/14-probability.pdf", grade: "Grade 11", section: "Chapter Tests" },

  { type: "Chapter Notes · Grade 12", title: "Continuity and Differentiability", desc: "Complete handwritten class notes for this chapter — 11 classes combined into one PDF.", file: "resources/grade-12-chapter-notes/continuity-and-differentiability.pdf", grade: "Grade 12", section: "Chapter-wise Notes" },
  { type: "Chapter Notes · Grade 12", title: "Matrices", desc: "Complete handwritten class notes for this chapter — 4 classes combined into one PDF.", file: "resources/grade-12-chapter-notes/matrices.pdf", grade: "Grade 12", section: "Chapter-wise Notes" },
  { type: "Chapter Notes · Grade 12", title: "Determinants", desc: "Complete handwritten class notes for this chapter — 3 classes combined into one PDF.", file: "resources/grade-12-chapter-notes/determinants.pdf", grade: "Grade 12", section: "Chapter-wise Notes" },
  { type: "Chapter Notes · Grade 12", title: "Application of Derivatives", desc: "Complete handwritten class notes for this chapter — 15 classes combined into one PDF.", file: "resources/grade-12-chapter-notes/application-of-derivatives.pdf", grade: "Grade 12", section: "Chapter-wise Notes" },
  { type: "Chapter Notes · Grade 12", title: "Linear Programming", desc: "Complete handwritten class notes for this chapter — 1 class.", file: "resources/grade-12-chapter-notes/linear-programming.pdf", grade: "Grade 12", section: "Chapter-wise Notes" },
  { type: "Chapter Notes · Grade 12", title: "Inverse Trigonometric Functions", desc: "Complete handwritten class notes for this chapter — 5 classes combined into one PDF.", file: "resources/grade-12-chapter-notes/inverse-trigonometric-functions.pdf", grade: "Grade 12", section: "Chapter-wise Notes" },
  { type: "Chapter Notes · Grade 12", title: "Integrals", desc: "Complete handwritten class notes for this chapter — 19 classes combined into one PDF.", file: "resources/grade-12-chapter-notes/integrals.pdf", grade: "Grade 12", section: "Chapter-wise Notes" },
  { type: "Chapter Notes · Grade 12", title: "Application of Integrals", desc: "Complete handwritten class notes for this chapter — 1 class.", file: "resources/grade-12-chapter-notes/application-of-integrals.pdf", grade: "Grade 12", section: "Chapter-wise Notes" },
  { type: "Chapter Notes · Grade 12", title: "Vectors", desc: "Complete handwritten class notes for this chapter — 2 classes combined into one PDF.", file: "resources/grade-12-chapter-notes/vectors.pdf", grade: "Grade 12", section: "Chapter-wise Notes" }
];
