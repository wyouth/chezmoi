# Shared interactive Fish configuration for Linux workstations and servers.

# Keep user-installed tools ahead of system packages without writing
# machine-specific universal variables to fish_variables.
fish_add_path --path --move "$HOME/.local/bin" "$HOME/.local/share/fnm"

if not status is-interactive
    return
end

set -g fish_greeting

# Prompt helpers: useful Git state without scanning untracked files.
set -g __fish_git_prompt_showdirtystate true
set -g __fish_git_prompt_showstashstate true
set -g __fish_git_prompt_showupstream auto
set -g __fish_git_prompt_showcolorhints true

# Common interactive shortcuts. Fish expands these before execution, so the
# resulting commands remain visible and editable.
abbr --add ll 'ls -alF'
abbr --add la 'ls -A'
abbr --add l 'ls -CF'

if type -q fnm
    fnm env --shell fish | source
end
