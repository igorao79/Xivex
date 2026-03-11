import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock components that use client-side only features
jest.mock("react-dropzone", () => ({
  useDropzone: jest.fn(() => ({
    getRootProps: () => ({ role: "presentation" }),
    getInputProps: () => ({ type: "file" }),
    isDragActive: false,
    acceptedFiles: [],
  })),
}));

import { FileUpload } from "@/components/file-upload";
import { MarkdownRenderer } from "@/components/markdown-renderer";

describe("FileUpload", () => {
  it("renders upload area with instructions", () => {
    render(
      <FileUpload
        onFileUpload={jest.fn()}
        isUploading={false}
        progress={0}
      />
    );

    expect(screen.getByText("Upload a document")).toBeInTheDocument();
    expect(screen.getByText(/Drag & drop/)).toBeInTheDocument();
  });

  it("shows progress when uploading", () => {
    render(
      <FileUpload
        onFileUpload={jest.fn()}
        isUploading={true}
        progress={45}
      />
    );

    expect(screen.getByText("Analyzing document...")).toBeInTheDocument();
    expect(screen.getByText("45%")).toBeInTheDocument();
  });

  it("shows supported file types", () => {
    render(
      <FileUpload
        onFileUpload={jest.fn()}
        isUploading={false}
        progress={0}
      />
    );

    expect(screen.getByText(".pdf")).toBeInTheDocument();
    expect(screen.getByText(".docx")).toBeInTheDocument();
    expect(screen.getByText(".xlsx")).toBeInTheDocument();
  });
});

describe("MarkdownRenderer", () => {
  it("renders markdown content", () => {
    render(<MarkdownRenderer content="**Bold text** and *italic text*" />);

    expect(screen.getByText("Bold text")).toBeInTheDocument();
    expect(screen.getByText("italic text")).toBeInTheDocument();
  });

  it("renders headings", () => {
    render(<MarkdownRenderer content="## Section Title" />);

    expect(screen.getByText("Section Title")).toBeInTheDocument();
  });

  it("renders bullet lists", () => {
    render(
      <MarkdownRenderer content={"- Item one\n- Item two\n- Item three"} />
    );

    expect(screen.getByText("Item one")).toBeInTheDocument();
    expect(screen.getByText("Item two")).toBeInTheDocument();
    expect(screen.getByText("Item three")).toBeInTheDocument();
  });

  it("renders code blocks", () => {
    render(<MarkdownRenderer content={"`inline code` here"} />);

    expect(screen.getByText("inline code")).toBeInTheDocument();
  });

  it("renders tables", () => {
    const table = "| Name | Age |\n|------|-----|\n| Alice | 30 |";
    render(<MarkdownRenderer content={table} />);

    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });
});
