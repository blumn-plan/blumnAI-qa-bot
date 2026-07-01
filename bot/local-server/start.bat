@echo off
REM planner QA bot — 로컬 PC 시작 스크립트.
REM 더블 클릭하면 server + cloudflared + wrangler 등록 한 번에 실행.
REM Ctrl+C 로 종료. 창 닫으면 즉시 종료.

cd /d "%~dp0"

echo ==========================================
echo  planner-qa-bot 로컬 모드 시작
echo ==========================================
echo  서버:    http://localhost:8788
echo  터널:    cloudflared quick tunnel (URL 잠시 후 출력됨)
echo  Worker:  TUNNEL_URL 자동 등록 (wrangler)
echo ==========================================
echo.
echo  ※ 이 창을 닫으면 챗 서비스가 즉시 중단됩니다.
echo  ※ PC 가 절전·종료 모드 진입해도 중단됩니다.
echo.

node launcher.js

pause
