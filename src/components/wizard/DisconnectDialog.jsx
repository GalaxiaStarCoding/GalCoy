import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export default function DisconnectDialog({ open, onYes, onNo }) {
  return (
    <Dialog open={open}>
      <DialogContent
        onEscapeKeyDown={onNo}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Save server information?</DialogTitle>
          <DialogDescription>
            Would you like to save this server's information before disconnecting?
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="outline" onClick={onNo}>
            No
          </Button>
          <Button onClick={onYes}>
            Yes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}