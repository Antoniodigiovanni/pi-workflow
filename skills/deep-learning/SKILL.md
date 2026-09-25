---
name: deep-learning
description: Engineer deep learning training loops and checkpoints with attention to accelerators, numerical stability, and restartability.
---

# Deep learning engineering

- Identify available accelerator and memory budget; support a small CPU smoke path where useful. Keep model definition, data pipeline, training loop, and configuration separately testable.
- Seed relevant libraries and record nondeterministic operations where reproducibility is limited. Prevent validation leakage and select checkpoints using only designated validation data.
- Save model, optimizer, scheduler, scaler, epoch/step, and configuration state as needed for correct resume. Verify a restart path when runs are costly.
- Use mixed precision, gradient accumulation, and distributed training only when scale justifies them; account for effective batch size and numerical effects.
- Watch NaN/Inf values, exploding gradients, dataloader stalls, memory growth, GPU utilization, and checkpoint size. Run a small batch overfit or smoke test before expensive training.
- Record model and data versions and the environment needed to reproduce or serve the selected checkpoint.
