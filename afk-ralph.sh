#!/bin/bash

# Default to 5 iterations if no argument is provided
MAX_ITERATIONS=${1:-5}
WORK_DIR=".scratch/claude-md-thinning"

# 1. Create a directory for completed issues
mkdir -p "${WORK_DIR}/issues/done"
touch "${WORK_DIR}/progress.txt"

echo "🚀 Starting optimized AFK loop for a maximum of $MAX_ITERATIONS iterations..."

for ((i=1; i<=$MAX_ITERATIONS; i++)); do
    # 2. Find the next issue (Numerical order automatically via ls)
    NEXT_ISSUE=$(ls -1 "${WORK_DIR}/issues/"*.md 2>/dev/null | head -n 1)

    # If no files are found, we are done
    if [ -z "$NEXT_ISSUE" ]; then
        echo "✅ No more issues found! Project completed."
        break
    fi

    ISSUE_FILENAME=$(basename "$NEXT_ISSUE")
    echo "------------------------------------------------"
    echo "🔄 Iteration $i -> Processing: $ISSUE_FILENAME"
    echo "------------------------------------------------"
    
    # 3. Inject context and execute Claude fully headless
    result=$(claude --dangerously-skip-permissions -p "
Carefully read @${WORK_DIR}/PRD.md, @${WORK_DIR}/progress.txt, and specifically this issue: @${NEXT_ISSUE}.

Mission:
1. Execute the tasks defined ONLY in @${NEXT_ISSUE} using TDD.
2. Make a Git commit with the changes. Format: 'feat: [Issue topic]'.
3. Update @${WORK_DIR}/progress.txt with a short summary of what you built.
4. Output exactly <promise>ISSUE_COMPLETE</promise> at the end of your response so the system knows it's done.
")

# 👇 ESTA ES LA LÍNEA MÁGICA DE MATT POCOCK 👇
    echo "$result"

    # 4. Handle success (move file) or failure (print logs)
    if [[ "$result" == *"<promise>ISSUE_COMPLETE</promise>"* ]]; then
        echo "✅ Issue successfully completed by Claude."
        mv "$NEXT_ISSUE" "${WORK_DIR}/issues/done/"
    else
        echo "⚠️ Claude did not return the success signal (test failed or surrendered)."
        echo "🚨 --- START OF CLAUDE DEBUG LOG --- 🚨"
        echo "$result"
        echo "🚨 --- END OF LOG --- 🚨"
        echo "Aborting loop to prevent damage."
        break
    fi

    # Safety pause between iterations
    sleep 3 
done

echo "🏁 Script execution finished."