# Proxy helpers shared by Fish sessions.
# The WSL workstation defaults to its local proxy; remote Linux hosts do not.

set -q PROXY_HOST; or set -gx PROXY_HOST 127.0.0.1
set -q PROXY_HTTP_PORT; or set -gx PROXY_HTTP_PORT 7890
set -q PROXY_SOCKS_PORT; or set -gx PROXY_SOCKS_PORT 7890

function proxy_on --description 'Enable HTTP, HTTPS, and SOCKS proxies'
    if test (count $argv) -gt 1
        echo 'usage: proxy_on [host:port|port]' >&2
        return 1
    end

    set -l proxy_host $PROXY_HOST
    set -l http_port $PROXY_HTTP_PORT
    set -l socks_port $PROXY_SOCKS_PORT

    if test (count $argv) -eq 1
        if string match --quiet --regex '^[0-9]+$' -- $argv[1]
            set http_port $argv[1]
            set socks_port $argv[1]
        else if string match --quiet --regex '^[^:]+:[0-9]+$' -- $argv[1]
            set -l endpoint (string split --max 1 ':' -- $argv[1])
            set proxy_host $endpoint[1]
            set http_port $endpoint[2]
            set socks_port $endpoint[2]
        else
            echo 'usage: proxy_on [host:port|port]' >&2
            return 1
        end
    end

    set -gx http_proxy "http://$proxy_host:$http_port"
    set -gx https_proxy $http_proxy
    set -gx all_proxy "socks5://$proxy_host:$socks_port"
    set -gx HTTP_PROXY $http_proxy
    set -gx HTTPS_PROXY $https_proxy
    set -gx ALL_PROXY $all_proxy
    set -gx no_proxy 'localhost,127.0.0.1,::1,.local'
    set -gx NO_PROXY $no_proxy

    echo 'proxy on'
    echo "  http/https  $http_proxy"
    echo "  socks5      $all_proxy"
    echo "  no_proxy    $no_proxy"
end

function proxy_off --description 'Disable HTTP, HTTPS, and SOCKS proxies'
    set --erase http_proxy https_proxy all_proxy
    set --erase HTTP_PROXY HTTPS_PROXY ALL_PROXY
    set --erase no_proxy NO_PROXY
    echo 'proxy off'
end

function proxy_status --description 'Show current proxy settings'
    if not set -q http_proxy; and not set -q HTTP_PROXY
        echo 'proxy: off'
        return 0
    end

    echo 'proxy: on'
    set -q http_proxy; and echo "  http_proxy   $http_proxy"
    set -q https_proxy; and echo "  https_proxy  $https_proxy"
    set -q all_proxy; and echo "  all_proxy    $all_proxy"
    set -q no_proxy; and echo "  no_proxy     $no_proxy"
end

if string match --quiet --ignore-case '*microsoft*' -- (uname --release)
    proxy_on >/dev/null
end
