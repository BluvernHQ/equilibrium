import re

def analyze_jsx(file_path):
    with open(file_path, 'r') as f:
        content = f.read()

    # Find all opening and closing tags using a more robust regex
    # This regex handles props and namespaced tags
    tags = re.findall(r'<(/?)([a-zA-Z0-9:]+)(?:\s+[^>]*?)?(/?\s*)>', content)
    
    stack = []
    line_num = 1
    # We need to track line numbers, so we'll regex line by line or use finditer
    
    # Better to use finditer to track position and line number
    for match in re.finditer(r'<(/?)([a-zA-Z0-9:]+)(?:\s+[^>]*?)?(/?\s*)>', content):
        line_num = content.count('\n', 0, match.start()) + 1
        is_closing = match.group(1) == '/'
        tag_name = match.group(2)
        is_self_closing = match.group(3).strip() == '/' or tag_name in ['img', 'br', 'hr', 'input', 'meta', 'link']

        if is_self_closing:
            continue
        
        if is_closing:
            if not stack:
                print(f"Error: Unexpected closing tag </{tag_name}> at line {line_num}")
                continue
            last_tag, last_line = stack.pop()
            if last_tag != tag_name:
                print(f"Error: Mismatched tag. Opened <{last_tag}> at line {last_line}, closed </{tag_name}> at line {line_num}")
        else:
            stack.append((tag_name, line_num))

    while stack:
        tag, line = stack.pop()
        print(f"Error: Unclosed tag <{tag}> opened at line {line}")

analyze_jsx('src/modules/sessions/section/sessions.tsx')
