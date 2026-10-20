# WSL / Unix shell proxy helpers (bash & zsh).
# Source from ~/.bashrc / ~/.zshrc. Does not auto-enable.
#
#   proxy_on              # http/https + socks5 → 127.0.0.1:7890
#   proxy_on 7890         # same host, override port (http & socks)
#   proxy_on 127.0.0.1:7890
#   proxy_off
#   proxy_status

: "${PROXY_HOST:=127.0.0.1}"
: "${PROXY_HTTP_PORT:=7890}"
: "${PROXY_SOCKS_PORT:=7890}"

_proxy_parse_endpoint() {
  # Sets _proxy_host _proxy_http_port _proxy_socks_port from optional $1.
  _proxy_host="$PROXY_HOST"
  _proxy_http_port="$PROXY_HTTP_PORT"
  _proxy_socks_port="$PROXY_SOCKS_PORT"

  case "${1-}" in
    "")
      return 0
      ;;
    *[!0-9]*)
      # host:port
      case "$1" in
        *:*:*)
          echo "proxy_on: use host:port or port only" >&2
          return 1
          ;;
        *:*)
          _proxy_host="${1%:*}"
          _proxy_http_port="${1##*:}"
          _proxy_socks_port="$_proxy_http_port"
          ;;
        *)
          echo "usage: proxy_on [host:port|port]" >&2
          return 1
          ;;
      esac
      ;;
    *)
      # bare port
      _proxy_http_port="$1"
      _proxy_socks_port="$1"
      ;;
  esac

  case "$_proxy_http_port" in
    "" | *[!0-9]*)
      echo "proxy_on: invalid port: $_proxy_http_port" >&2
      return 1
      ;;
  esac
}

proxy_on() {
  _proxy_parse_endpoint "${1-}" || return 1

  export http_proxy="http://${_proxy_host}:${_proxy_http_port}"
  export https_proxy="http://${_proxy_host}:${_proxy_http_port}"
  export all_proxy="socks5://${_proxy_host}:${_proxy_socks_port}"
  export HTTP_PROXY="$http_proxy"
  export HTTPS_PROXY="$https_proxy"
  export ALL_PROXY="$all_proxy"
  export no_proxy="localhost,127.0.0.1,::1,.local"
  export NO_PROXY="$no_proxy"

  echo "proxy on"
  echo "  http/https  $http_proxy"
  echo "  socks5      $all_proxy"
  echo "  no_proxy    $no_proxy"
}

proxy_off() {
  unset http_proxy https_proxy all_proxy \
        HTTP_PROXY HTTPS_PROXY ALL_PROXY \
        no_proxy NO_PROXY
  echo "proxy off"
}

proxy_status() {
  local http="${http_proxy:-${HTTP_PROXY:-}}"
  local https="${https_proxy:-${HTTPS_PROXY:-}}"
  local all="${all_proxy:-${ALL_PROXY:-}}"
  local nop="${no_proxy:-${NO_PROXY:-}}"

  if [ -z "$http" ] && [ -z "$https" ] && [ -z "$all" ]; then
    echo "proxy: off"
    return 0
  fi

  echo "proxy: on"
  echo "  http_proxy   ${http:-(unset)}"
  echo "  https_proxy  ${https:-(unset)}"
  echo "  all_proxy    ${all:-(unset)}"
  echo "  no_proxy     ${nop:-(unset)}"
}
