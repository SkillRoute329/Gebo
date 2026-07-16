import json
import sys

transcript_path = r"C:\Users\jonat\.gemini\antigravity\brain\2642b287-06b5-4ebe-9263-fafede63e25b\.system_generated\logs\transcript.jsonl"

try:
    with open(transcript_path, 'r', encoding='utf-8') as f:
        for line in f:
            try:
                data = json.loads(line)
                # Check if it's a tool call for write_to_file or multi_replace_file_content
                if 'tool_calls' in data:
                    for tc in data['tool_calls']:
                        if 'TargetFile' in tc.get('arguments', {}):
                            if 'Login.jsx' in tc['arguments']['TargetFile']:
                                print(f"Step {data.get('step_index')}: {tc.get('name')} -> {tc['arguments']['TargetFile']}")
                                if 'Instruction' in tc['arguments']:
                                    print(f"Instruction: {tc['arguments']['Instruction']}")
                                elif 'Description' in tc['arguments']:
                                    print(f"Description: {tc['arguments']['Description']}")
            except json.JSONDecodeError:
                pass
except Exception as e:
    print(e)
