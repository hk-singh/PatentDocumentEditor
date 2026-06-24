from html import escape
from html.parser import HTMLParser


ALLOWED_DOCUMENT_TAGS = {
    "blockquote",
    "br",
    "code",
    "em",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "li",
    "ol",
    "p",
    "pre",
    "s",
    "strong",
    "ul",
}


class DocumentHTMLSanitizer(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.open_tags: list[str] = []
        self.discard_depth = 0

    def handle_starttag(self, tag: str, attrs) -> None:
        normalized_tag = tag.lower()
        if self.discard_depth:
            self.discard_depth += 1
            return
        if normalized_tag in {"iframe", "script", "style", "svg"}:
            self.discard_depth = 1
            return
        if normalized_tag not in ALLOWED_DOCUMENT_TAGS:
            return
        if normalized_tag == "br":
            self.parts.append("<br>")
            return
        self.open_tags.append(normalized_tag)
        self.parts.append(f"<{normalized_tag}>")

    def handle_endtag(self, tag: str) -> None:
        normalized_tag = tag.lower()
        if self.discard_depth:
            self.discard_depth -= 1
            return
        if normalized_tag == "br" or normalized_tag not in ALLOWED_DOCUMENT_TAGS:
            return
        if normalized_tag not in self.open_tags:
            return
        while self.open_tags:
            open_tag = self.open_tags.pop()
            self.parts.append(f"</{open_tag}>")
            if open_tag == normalized_tag:
                break

    def handle_data(self, data: str) -> None:
        if self.discard_depth:
            return
        self.parts.append(escape(data))

    def handle_entityref(self, name: str) -> None:
        if self.discard_depth:
            return
        self.parts.append(f"&{name};")

    def handle_charref(self, name: str) -> None:
        if self.discard_depth:
            return
        self.parts.append(f"&#{name};")

    def html(self) -> str:
        while self.open_tags:
            self.parts.append(f"</{self.open_tags.pop()}>")
        return "".join(self.parts).strip()


def sanitize_document_html(content: str) -> str:
    sanitizer = DocumentHTMLSanitizer()
    sanitizer.feed(content)
    sanitizer.close()
    return sanitizer.html()
