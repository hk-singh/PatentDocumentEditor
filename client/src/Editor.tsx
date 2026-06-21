import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

const extensions = [StarterKit];

export interface EditorProps {
  handleEditorChange: (content: string) => void;
  content: string;
}

export default function Editor({ handleEditorChange, content }: EditorProps) {
  const editor = useEditor({
    content: content,
    editable: true,
    extensions: extensions,
    editorProps: {
      attributes: {
        class: "patent-editor",
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      handleEditorChange(html);
    },
  });

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content, false);
    }
  }, [content, editor]);

  return <EditorContent editor={editor} className="w-full" />;
}
