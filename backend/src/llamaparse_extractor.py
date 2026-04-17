import os
import nest_asyncio
nest_asyncio.apply()  # needed for async in scripts/notebooks

from llama_parse import LlamaParse
from dotenv import load_dotenv

load_dotenv()

# Geotechnical instruction passed to the LLM-powered parser
_GEO_INSTRUCTION = (
    "This is a geotechnical site investigation report (SIR) from India. "
    "It contains boring logs, SPT N-values, soil classification tables, "
    "and references to IS codes (IS:2131, IS:1892, IS:1498). "
    "Preserve all table structures exactly. Do not merge or skip rows."
)

def get_parser(tier: str = "agentic") -> LlamaParse:
    """
    tier options:
      'cost_effective' - for clean digital PDFs
      'agentic'        - for scanned PDFs, mixed layouts (recommended for SIRs)
      'agentic_plus'   - max fidelity for complex multi-table docs
    """
    return LlamaParse(
        api_key=os.getenv("LLAMA_CLOUD_API_KEY"),
        result_type="markdown",
        parsing_instruction=_GEO_INSTRUCTION,
        verbose=False,
    )


def parse_pdf(pdf_path: str, tier: str = "agentic") -> str:
    """
    Parse a single SIR PDF. Returns clean markdown string.
    
    Usage:
        markdown = parse_pdf("data/raw/report_001.pdf")
    """
    parser = get_parser(tier)
    docs = parser.load_data(pdf_path)
    return "\n\n".join(doc.text for doc in docs)


def parse_directory(data_dir: str = "data/raw/", tier: str = "agentic") -> dict[str, str]:
    """
    Parse all PDFs in a directory.
    Returns dict: {filename -> markdown_text}
    
    Usage:
        results = parse_directory("data/raw/")
        for fname, md in results.items():
            print(fname, len(md))
    """
    import nest_asyncio
    nest_asyncio.apply()
    from llama_index.core import SimpleDirectoryReader

    parser = get_parser(tier)
    file_extractor = {".pdf": parser}
    documents = SimpleDirectoryReader(
        data_dir, file_extractor=file_extractor
    ).load_data()

    results: dict[str, str] = {}
    for doc in documents:
        fname = doc.metadata.get("file_name", "unknown.pdf")
        results.setdefault(fname, []).append(doc.text)

    return {k: "\n\n".join(v) for k, v in results.items()}