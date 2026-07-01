# sample-policy-repo

`blumnAI-qa-bot` 가 어떻게 동작하는지 보여주는 **샘플 사용자 레포**.

실제 다른 팀이 자기 레포를 만들면 이 구조와 똑같은 모습이 됩니다.

## 폴더

```
blumnAI-qa-bot.config.yml      ← 봇 동작 결정하는 단 1개 파일
.blumnAI-qa-bot/               ← CLI 가 깔아준 영역 (수정 X)
projects/sample/docs/policies/ ← 정책 markdown (팀이 작성)
qa/decisions/                  ← 변경요청 합의문 (자동 생성)
qa/feedback/                   ← AI 답변 개선 룰 (자동 생성)
```

## 따라하기

코어 레포 [docs/01-INSTALL.md](../../docs/01-INSTALL.md) 참고.
