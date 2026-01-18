# Tasks
- Define a chat tool named `create_transition`.
- Workflow:
  - Call `list_clips` first.
  - Use the user’s described clip positions to identify the preceding and succeeding timeline clips.
  - Extract the last frame of the preceding clip and the first frame of the succeeding clip.
  - Send those frames to VEO 3 to generate a smooth fade transition.
  - Automatically splice the generated transition video between the two clips.
- Inputs:
  - Identifiers for the preceding and succeeding clips (their order/position in the current timeline).
