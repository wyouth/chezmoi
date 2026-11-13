function fish_prompt
    set -l last_status $status
    set -l last_duration $CMD_DURATION
    set -l host (prompt_hostname)

    if string match --quiet --ignore-case '*microsoft*' -- (uname --release)
        set_color --bold cyan
        printf '%s@WSL:%s ' (whoami) $host
    else
        set_color --bold green
        printf '%s@%s ' (whoami) $host
    end

    set_color --bold blue
    printf '%s' (prompt_pwd)

    set_color normal
    fish_git_prompt ' (%s)'

    if test $last_status -ne 0
        set_color --bold red
        printf ' exit:%s' $last_status
    end

    if test -n "$last_duration"; and test $last_duration -ge 1000
        set_color yellow
        printf ' %sms' $last_duration
    end

    printf '\n'
    if fish_is_root_user
        set_color --bold red
        printf '# '
    else
        set_color --bold green
        printf '> '
    end
    set_color normal
end
