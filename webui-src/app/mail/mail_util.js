const m = require('mithril');
const rs = require('rswebui');
const widget = require('widgets');

// rsmsgs.h
const RS_MSG_BOXMASK = 0x000f;

const RS_MSG_INBOX = 0x00;
const RS_MSG_SENTBOX = 0x01;
const RS_MSG_OUTBOX = 0x03;
const RS_MSG_DRAFTBOX = 0x05;
const RS_MSG_TRASH = 0x000020;
const RS_MSG_NEW = 0x10;
const RS_MSG_UNREAD_BY_USER = 0x40;
const RS_MSG_STAR = 0x200;
const RS_MSG_SPAM = 0x040000;

const RS_MSGTAGTYPE_IMPORTANT = 1;
const RS_MSGTAGTYPE_WORK = 2;
const RS_MSGTAGTYPE_PERSONAL = 3;
const RS_MSGTAGTYPE_TODO = 4;
const RS_MSGTAGTYPE_LATER = 5;
const RS_MSG_USER_REQUEST = 0x000400;
const RS_MSG_FRIEND_RECOMMENDATION = 0x000800;
const RS_MSG_PUBLISH_KEY = 0x020000;
const RS_MSG_SYSTEM = RS_MSG_USER_REQUEST | RS_MSG_FRIEND_RECOMMENDATION | RS_MSG_PUBLISH_KEY;

const BOX_ALL = 0x06;

const MessageSummary = () => {
  let details = {};
  let files = [];
  let isStarred = undefined;
  let msgStatus = '';
  let fromUserInfo = {};
  return {
    oninit: async (v) => {
      const res = await rs.rsJsonApiRequest('/rsMsgs/getMessage', {
        msgId: v.attrs.details.msgId,
      });
      if (res.body.retval) {
        details = res.body.msg;
        files = details.files;

        isStarred = (details.msgflags & 0xf00) === RS_MSG_STAR;

        const flag = details.msgflags & 0xf0;
        if (flag === RS_MSG_NEW || flag === RS_MSG_UNREAD_BY_USER) {
          msgStatus = 'unread';
        } else {
          msgStatus = 'read';
        }
      }
      if (details && details.from && details.from._addr_string) {
        rs.rsJsonApiRequest(
          '/rsIdentity/getIdDetails',
          {
            id: details.from._addr_string,
          },
          (data) => {
            fromUserInfo = data.details;
          }
        );
      }
    },
    view: (v) =>
      m(
        'tr.msgbody',
        {
          key: details.msgId,
          class: msgStatus,
          onclick: () =>
            m.route.set('/mail/:tab/:msgId', {
              tab: v.attrs.category,
              msgId: details.msgId,
            }),
        },
        [
          m(
            'td',
            m('input.star-check[type=checkbox][id=msg-' + details.msgId + ']', {
              checked: isStarred,
            }),
            // Use label with  [for] to manipulate hidden checkbox
            m(
              'label.star-check[for=msg-' + details.msgId + ']',
              {
                onclick: (e) => {
                  isStarred = !isStarred;
                  rs.rsJsonApiRequest('/rsMsgs/MessageStar', {
                    msgId: details.msgId,
                    mark: isStarred,
                  });
                  // Stop event bubbling, both functions for supporting IE & FF
                  e.stopImmediatePropagation();
                  e.preventDefault();
                },
                class: (details.msgflags & 0xf00) === RS_MSG_STAR ? 'starred' : 'unstarred',
              },
              m('i.fas.fa-star')
            )
          ),
          m('td', files.length),
          m('td', details.title),
          fromUserInfo &&
            m('td', Number(fromUserInfo.mId) === 0 ? '[Unknown]' : fromUserInfo.mNickname),
          m('td', new Date(details.ts * 1000).toLocaleString()),
        ]
      ),
  };
};

const MessageView = () => {
  let details = {};
  let message = '';
  return {
    oninit: (v) =>
      rs.rsJsonApiRequest(
        '/rsMsgs/getMessage',
        {
          msgId: v.attrs.id,
        },
        (data) => {
          details = data.msg;
          // regex to detect html tags
          // better regex?  /<[a-z][\s\S]*>/gi
          if (/<\/*[a-z][^>]+?>/gi.test(details.msg)) {
            message = details.msg;
          } else {
            message = '<p style="white-space: pre">' + details.msg + '</p>';
          }
        }
      ),
    view: (v) =>
      m(
        '.widget.msgview',
        {
          key: details.msgId,
        },
        [
          m(
            'a[title=Back]',
            {
              onclick: () =>
                m.route.set('/mail/:tab', {
                  tab: m.route.param().tab,
                }),
            },
            m('i.fas.fa-arrow-left')
          ),
          m('h3', details.title),
          details.rsgxsid_srcId &&
            m('from', { style: { display: 'block ruby' } }, [
              m('p', { style: { fontWeight: 'bold' } }, 'From: '),
              // m('p', 'hello'),
              rs.userList.userMap[details.rsgxsid_srcId],
            ]),
          details.rsgxsid_msgto &&
            m('to', { style: { display: 'block ruby' } }, [
              m('p', { style: { fontWeight: 'bold' } }, 'To: '),
              details.rsgxsid_msgto.map((id) => m('p', rs.userList.userMap[id] + ', ')),
            ]),
          details.rsgxsid_msgcc &&
            details.rsgxsid_msgcc.length > 0 &&
            m('cc', { style: { display: 'block ruby' } }, [
              m('p', { style: { fontWeight: 'bold' } }, 'cc: '),
              details.rsgxsid_msgcc.map((id) => m('p', rs.userList.userMap[id] + ', ')),
            ]),
          m('button', 'Reply'),
          m('button', 'Reply All'),
          m('button', 'Forward'),
          m(
            'button',
            {
              onclick: () =>
                widget.popupMessage([
                  m('p', 'Are you sure you want to delete this mail?'),
                  m(
                    'button',
                    {
                      onclick: async () => {
                        rs.rsJsonApiRequest('/rsMsgs/MessageToTrash', {
                          msgId: details.msgId,
                          bTrash: true,
                        });
                        const res = await rs.rsJsonApiRequest('/rsMsgs/MessageDelete', {
                          msgId: details.msgId,
                        });
                        res.body.retval === false
                          ? widget.popupMessage([
                              m('h3', 'Error'),
                              m('hr'),
                              m('p', res.body.errorMessage),
                            ])
                          : widget.popupMessage([
                              m('h3', 'Success'),
                              m('hr'),
                              m('p', 'Mail Deleted.'),
                            ]);
                        m.redraw();
                        m.route.set('/mail/:tab', {
                          tab: m.route.param().tab,
                        });
                      },
                    },
                    'Delete'
                  ),
                ]),
            },
            'Delete'
          ),
          m('hr'),
          m(
            'iframe[title=message].msg',
            {
              srcdoc: message,
            },
            message
          ),
        ]
      ),
  };
};

const Table = () => {
  return {
    oninit: (v) => {},
    view: (v) =>
      m('table.mails', [
        m('tr', [
          m('th[title=starred]', m('i.fas.fa-star')),
          m('th[title=attachments]', m('i.fas.fa-paperclip')),
          m('th', 'Subject'),
          m('th', 'From'),
          m('th', 'Date'),
        ]),
        v.children,
      ]),
  };
};
const SearchBar = () => {
  let searchString = '';
  return {
    view: (v) =>
      m('input[type=text][id=searchmail][placeholder=Search Subject].searchbar', {
        value: searchString,
        oninput: (e) => {
          searchString = e.target.value.toLowerCase();
          for (const hash in v.attrs.list) {
            if (v.attrs.list[hash].fname.toLowerCase().indexOf(searchString) > -1) {
              v.attrs.list[hash].isSearched = true;
            } else {
              v.attrs.list[hash].isSearched = false;
            }
          }
        },
      }),
  };
};
function popupMessageCompose(message) {
  const container = document.getElementById('modal-container');
  container.style.display = 'block';
  m.render(
    container,
    m('.modal-content[id=composepopup]', [
      m(
        'button.red',
        {
          onclick: () => (container.style.display = 'none'),
        },
        m('i.fas.fa-times')
      ),
      message,
    ])
  );
}
module.exports = {
  MessageSummary,
  MessageView,
  Table,
  SearchBar,
  popupMessageCompose,
  RS_MSG_BOXMASK,
  RS_MSG_INBOX,
  RS_MSG_SENTBOX,
  RS_MSG_OUTBOX,
  RS_MSG_DRAFTBOX,
  RS_MSG_NEW,
  RS_MSG_UNREAD_BY_USER,
  RS_MSG_STAR,
  RS_MSG_TRASH,
  RS_MSG_SYSTEM,
  RS_MSG_SPAM,
  RS_MSGTAGTYPE_IMPORTANT,
  RS_MSGTAGTYPE_LATER,
  RS_MSGTAGTYPE_PERSONAL,
  RS_MSGTAGTYPE_TODO,
  RS_MSGTAGTYPE_WORK,
  BOX_ALL,
};
