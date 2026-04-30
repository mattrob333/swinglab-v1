import { createElement as h } from "react";

export const metadata = {
  title: "Upload Swing Video | SwingLab",
  description: "Upload a baseball swing video for analysis.",
};

export default function UploadPage() {
  return h(
    "main",
    {
      className:
        "min-h-screen bg-neutral-950 px-6 py-10 text-neutral-50 sm:px-8",
    },
    h(
      "section",
      {
        className:
          "mx-auto flex w-full max-w-3xl flex-col gap-8 rounded-lg border border-neutral-800 bg-neutral-900 p-6 shadow-2xl sm:p-8",
      },
      h(
        "div",
        { className: "space-y-3" },
        h(
          "p",
          {
            className:
              "text-sm font-semibold uppercase tracking-wide text-emerald-300",
          },
          "SwingLab",
        ),
        h(
          "h1",
          { className: "text-3xl font-semibold tracking-tight sm:text-4xl" },
          "Upload swing video",
        ),
        h(
          "p",
          { className: "max-w-2xl text-base leading-7 text-neutral-300" },
          "Send an MP4, MOV, or WebM clip of a baseball swing for analysis.",
        ),
      ),
      h(
        "form",
        {
          action: "/api/uploads",
          method: "post",
          encType: "multipart/form-data",
          className: "grid gap-5",
        },
        h(
          "label",
          { className: "grid gap-2 text-sm font-medium text-neutral-200" },
          "Hitter name",
          h("input", {
            name: "hitterName",
            type: "text",
            placeholder: "Maya Torres",
            className:
              "h-11 rounded-md border border-neutral-700 bg-neutral-950 px-3 text-neutral-50 outline-none transition focus:border-emerald-400",
          }),
        ),
        h(
          "label",
          { className: "grid gap-2 text-sm font-medium text-neutral-200" },
          "Swing video",
          h("input", {
            name: "swingVideo",
            type: "file",
            accept: "video/mp4,video/quicktime,video/webm",
            required: true,
            className:
              "rounded-md border border-dashed border-neutral-600 bg-neutral-950 px-3 py-6 text-sm text-neutral-300 file:mr-4 file:rounded-md file:border-0 file:bg-emerald-400 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-neutral-950",
          }),
        ),
        h(
          "button",
          {
            type: "submit",
            className:
              "inline-flex h-11 w-full items-center justify-center rounded-md bg-emerald-400 px-5 text-sm font-semibold text-neutral-950 transition hover:bg-emerald-300 sm:w-auto",
          },
          "Submit for analysis",
        ),
      ),
    ),
  );
}
