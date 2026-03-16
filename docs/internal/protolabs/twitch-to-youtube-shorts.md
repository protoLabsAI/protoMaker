# Twitch Streams to YouTube Shorts Pipeline

Operational runbook for converting Mon/Wed/Fri live coding streams into scheduled YouTube Shorts. Covers OBS recording setup, clip extraction tools, and the post-stream publishing workflow.

## Schedule

Josh streams live on Twitch three times per week: Monday, Wednesday, Friday — 1 hour each. Format: live coding + Q&A.

Target output: 3-5 YouTube Shorts per stream, published over the following week at optimal times via TubeBuddy.

## Tool Stack

| Tool | Cost | Purpose |
|------|------|---------|
| OBS Studio | Free | Recording with dual encode (stream CBR + record CQP) |
| OpusClip | Free tier (60 min/mo) | AI clip detection — 0.93 mAP accuracy |
| Gling | $10/mo | Filler word removal on talking-head segments |
| TubeBuddy | $9/mo | Optimal scheduling and SEO for YouTube |
| YouTube Studio | Free | Final upload and Shorts publishing |

## OBS Configuration

### Recording Format

Always record to **MKV**. Never MP4. MKV protects against data loss on crash — if OBS crashes mid-stream, MKV is recoverable; MP4 is not.

### Dual Encode Settings

OBS uses two outputs simultaneously: one for the Twitch stream, one for the local recording.

**Stream output (CBR — Twitch requirement):**

```
Encoder: NVENC H.264 (or x264 if no GPU)
Rate control: CBR
Bitrate: 6000 Kbps
Keyframe interval: 2s
Profile: high
```

**Recording output (CQP — quality-preserving):**

```
Encoder: NVENC H.264 (or x264)
Rate control: CQP
CQ level: 18 (lower = higher quality, 18 is near-lossless)
Container: MKV
```

To enable dual output in OBS:
1. Settings → Output → Output Mode: Advanced
2. Stream tab: configure CBR for Twitch
3. Recording tab: configure CQP to MKV

### Scene Setup

Recommended scenes for coding streams:

| Scene | Layout | When to Use |
|-------|--------|------------|
| `coding` | Full screen code editor + camera PiP (bottom-right) | Main coding segments |
| `talking` | Large camera + terminal/browser PiP | Explanations, Q&A |
| `screen-only` | Full screen, no camera | Demos, walkthroughs |
| `brb` | Static overlay | Short breaks |

The `talking` scene is the primary source for YouTube Shorts — full-face camera captures better for vertical crop.

### Twitch Integration

- Set stream key in OBS Settings → Stream → Twitch
- Enable "Automatically record when streaming" in General settings as a backup

## Post-Stream Workflow

After each stream, follow these steps in order. Target: clips scheduled within 2 hours of stream end.

### Step 1: Remux MKV to MP4

OBS produces an MKV file. Remux it to MP4 before uploading to tools. Remuxing is lossless — it only changes the container, not the video data.

In OBS: File → Remux Recordings → select the MKV → Remux. Output is an MP4 in the same directory.

Alternatively with ffmpeg:

```bash
ffmpeg -i stream-2024-01-15.mkv -c copy stream-2024-01-15.mp4
```

### Step 2: Upload to OpusClip

1. Log into OpusClip (free tier: 60 min/mo — each stream uses the full allowance)
2. Upload the remuxed MP4
3. Select clip length: 30-60 seconds (YouTube Shorts max: 60s)
4. Wait for AI analysis (~5-10 min)
5. Review suggested clips — OpusClip surfaces the highest-engagement moments

**Review time: ~15 min.** Approve 3-5 clips per stream. Look for:
- Clear explanations of concepts
- Moments of discovery or problem-solving
- Q&A segments with good questions
- Anything visually interesting (terminal output, diagrams)

Download approved clips as MP4.

### Step 3: Filler Word Cleanup (Gling)

For clips from `talking` scene segments:

1. Upload clip to Gling
2. Gling detects and removes "um", "uh", "like", "you know" automatically
3. Review the edit — reject removals that break the meaning
4. Download cleaned clip

Skip Gling for pure screen-share clips without voiceover.

### Step 4: Schedule via TubeBuddy

1. Upload cleaned clips to YouTube Studio
2. Set format: YouTube Shorts (under 60s vertical video, or use the #Shorts tag)
3. In TubeBuddy: use Best Time to Publish to find optimal slot for the week
4. Add title, description, and tags using TubeBuddy's SEO suggestions
5. Schedule — spread clips across the week (avoid same-day publishing)

**Title format:** Keep it under 60 characters. Lead with the concept, not "Live stream clip".

Example: "Why I use MKV over MP4 for OBS recording" not "Stream clip 01/15 — OBS settings"

## Monthly Budget

At 3 streams/week, OpusClip's free tier (60 min/mo) covers exactly 3 hours of footage. This is tight — prioritize the most engaging stream each week if usage approaches the limit.

When usage exceeds free tier, evaluate upgrading to paid OpusClip or batching across months.

## Related Documentation

- [Brand](./brand.md) — Voice, tone, and content strategy for protoLabs
- [Open Source Strategy](./open-source-strategy.md) — Audience and content pillars
