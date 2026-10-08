import type { MaterialFileType } from "@/types";

export type SampleFile = {
  type: MaterialFileType;
  url: string;
  license: string;
};

/**
 * Real public sample files used as `fileUrl` for seeded materials so
 * Preview/Download serves genuine content (PRD §5.4 hybrid seed strategy).
 *
 * Every URL was verified reachable (HTTP 200/206) on 2026-10-06.
 * License / attribution strings ship with the seeds and are surfaced in the
 * UI's file-info row — nothing is fetched or scraped at runtime beyond these
 * links.
 */
export const SAMPLE_FILES: SampleFile[] = [
  {
    type: "pdf",
    url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
    license: "W3C test asset — free to use",
  },
  {
    type: "docx",
    url: "https://filesamples.com/samples/document/docx/sample1.docx",
    license: "Sample files for testing (filesamples.com terms)",
  },
  {
    type: "xlsx",
    url: "https://filesamples.com/samples/document/xlsx/sample1.xlsx",
    license: "Sample files for testing (filesamples.com terms)",
  },
  {
    type: "pptx",
    url: "https://raw.githubusercontent.com/apache/poi/trunk/poi-examples/src/main/java/org/apache/poi/examples/xslf/pie-chart-template.pptx",
    license: "Apache-2.0 — Apache POI examples",
  },
  {
    type: "video",
    url: "https://mdn.github.io/shared-assets/videos/flower.mp4",
    license: "CC0 — MDN shared assets",
  },
  {
    type: "image",
    url: "https://mdn.github.io/shared-assets/images/diagrams/http/messages/http-1-connection.png",
    license: "CC0 — MDN shared assets",
  },
  {
    type: "text",
    url: "https://www.gutenberg.org/files/1342/1342-0.txt",
    license: "Public domain — Project Gutenberg",
  },
];
