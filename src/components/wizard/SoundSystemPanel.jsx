import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export default function SoundSystemPanel({ open, onClose, onSelect, onVACDetected }) {
  const [devices, setDevices] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    const fetchDevices = async () => {
      setLoading(true);
      try {
        // Request mic permission first — this unlocks device labels in browsers
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((t) => t.stop());
        } catch {}

        const all = await navigator.mediaDevices.enumerateDevices();
        const outputs = all.filter((d) => d.kind === 'audiooutput');
        setDevices(outputs);
        const vac = outputs.find(
          (d) =>
            d.label.toLowerCase().includes('line 1') ||
            d.label.toLowerCase().includes('virtual audio cable') ||
            d.label.toLowerCase().includes('vac')
        );
        if (vac) { setSelected(vac.deviceId); onSelect?.(vac.deviceId); onVACDetected?.(); }
        else if (outputs.length > 0) { setSelected(outputs[0].deviceId); onSelect?.(outputs[0].deviceId); }
      } catch {
        // enumerateDevices not available or permission denied
      }
      setLoading(false);
    };
    fetchDevices();
  }, [open]);

  const isVAC = (label) =>
    label.toLowerCase().includes('line 1') ||
    label.toLowerCase().includes('virtual audio cable');

  return (
    <Dialog open={open}>
      <DialogContent
        onEscapeKeyDown={onClose}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Sound System</DialogTitle>
          <DialogDescription>
            Select an audio output device. Line 1 (Virtual Audio Cable) is auto-detected if available.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p role="status" aria-live="polite">
            Detecting audio devices...
          </p>
        ) : devices.length === 0 ? (
          <p>
            No audio output devices found. Please ensure Virtual Audio Cable is installed.
          </p>
        ) : (
          <fieldset>
            <legend className="sr-only">Audio output devices</legend>
            <div className="space-y-1">
              {devices.map((device, i) => (
                <label
                  key={device.deviceId || i}
                  className="flex items-center gap-3 py-2 cursor-pointer rounded-lg px-2 hover:bg-muted/50"
                >
                  <input
                    type="radio"
                    name="audio-device"
                    value={device.deviceId}
                    checked={selected === device.deviceId}
                    onChange={() => {
                      setSelected(device.deviceId);
                      onSelect?.(device.deviceId);
                      if (isVAC(device.label)) onVACDetected?.();
                    }}
                    className="w-4 h-4"
                  />
                  <span>{device.label || `Audio Device ${i + 1}`}</span>
                  {isVAC(device.label) && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-accent/20 text-accent font-medium">
                      VAC Detected
                    </span>
                  )}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div className="flex justify-end mt-4">
          <Button onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}